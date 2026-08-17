import type { MatchSnapshot } from '../dota/types';

export type Side = 'radiant' | 'dire';

export type MatchEventKind =
  'match-start' | 'match-end' | 'kill' | 'tower' | 'barracks' | 'roshan';

export type MatchEvent = {
  kind: MatchEventKind;
  side: Side | null;
  text: string;
  priority: number;
  sound: boolean;
};

export const EVENT_TEXT = {
  matchStart: () => '',
  matchEnd: () => 'Game over',
  roshan: () => `Roshan killed`,
  building: (tag: string, what: string, noun: string) => `${tag} lost ${what} ${noun}`,
  kill: (killer: string, victims: readonly string[], gained: number) =>
    victims.length > 0
      ? `${killer} killed ${victims.join(' and ')}`
      : `${killer} ${gained > 1 ? `${gained} kills` : 'kill'}`,
} as const;

export const BUILDING_WORDS = {
  tier: (n: string) => `tier ${n}`,
  top: 'top',
  mid: 'mid',
  bottom: 'bottom',
  melee: 'melee',
  ranged: 'ranged',
  towerSingular: 'tower',
  towerPlural: 'towers',
  barracks: 'barracks',
} as const;

const TOWER_NAMES = [
  'TOP T1',
  'TOP T2',
  'TOP T3',
  'MID T1',
  'MID T2',
  'MID T3',
  'BOT T1',
  'BOT T2',
  'BOT T3',
  'T4',
  'T4',
] as const;

const BARRACKS_NAMES = [
  'TOP MELEE',
  'TOP RANGED',
  'MID MELEE',
  'MID RANGED',
  'BOT MELEE',
  'BOT RANGED',
] as const;

const ROSHAN_KILL_THRESHOLD_SEC = 60;

type Combat = {
  heroId: number;
  name: string;
  kills: number | null;
  deaths: number | null;
};

export type EventState = {
  matchId: string;
  radiantKills: number;
  direKills: number;
  radiantTowers: number | null;
  direTowers: number | null;
  radiantBarracks: number | null;
  direBarracks: number | null;
  radiantPlayers: Combat[];
  direPlayers: Combat[];
  roshanRespawnSec: number | null;
  live: boolean;
};

export type HeroName = (heroId: number) => string;

export const initialEventState: EventState = {
  matchId: '',
  radiantKills: 0,
  direKills: 0,
  radiantTowers: null,
  direTowers: null,
  radiantBarracks: null,
  direBarracks: null,
  radiantPlayers: [],
  direPlayers: [],
  roshanRespawnSec: null,
  live: false,
};

export function stateOf(snapshot: MatchSnapshot): EventState {
  return {
    matchId: snapshot.matchId,
    radiantKills: snapshot.radiant.kills,
    direKills: snapshot.dire.kills,
    radiantTowers: snapshot.radiant.towerState,
    direTowers: snapshot.dire.towerState,
    radiantBarracks: snapshot.radiant.barracksState,
    direBarracks: snapshot.dire.barracksState,
    radiantPlayers: combatOf(snapshot.radiant.players),
    direPlayers: combatOf(snapshot.dire.players),
    roshanRespawnSec: snapshot.roshanRespawnSec,
    live: snapshot.live,
  };
}

export function detectEvent(
  previous: EventState,
  snapshot: MatchSnapshot,
  heroName: HeroName = (heroId) => `#${heroId}`,
): { event: MatchEvent | null; state: EventState } {
  const state = stateOf(snapshot);

  // A new match resets every counter, so treat it as a start rather than a phantom swing.
  if (previous.matchId !== state.matchId) {
    return {
      event: state.live
        ? {
            kind: 'match-start',
            side: null,
            text: EVENT_TEXT.matchStart(),
            priority: 90,
            sound: true,
          }
        : null,
      state,
    };
  }

  if (previous.live && !state.live) {
    return {
      event: {
        kind: 'match-end',
        side: null,
        text: EVENT_TEXT.matchEnd(),
        priority: 100,
        sound: true,
      },
      state,
    };
  }

  if (!state.live) {
    return { event: null, state };
  }

  const candidates = [
    roshanEvent(previous, state),
    ...barracksEvents(previous, state, snapshot),
    ...towerEvents(previous, state, snapshot),
    killEvent(previous, state, snapshot, heroName),
  ].filter((event): event is MatchEvent => event !== null);

  const best = candidates.reduce<MatchEvent | null>(
    (winner, event) =>
      winner === null || event.priority > winner.priority ? event : winner,
    null,
  );

  return { event: best, state };
}

function roshanEvent(previous: EventState, state: EventState): MatchEvent | null {
  const before = previous.roshanRespawnSec;
  const after = state.roshanRespawnSec;
  if (before === null || after === null) {
    return null;
  }
  // The timer counts down, so it only rises when he has just been killed.
  if (after > before && after > ROSHAN_KILL_THRESHOLD_SEC) {
    return {
      kind: 'roshan',
      side: null,
      text: EVENT_TEXT.roshan(),
      priority: 75,
      sound: true,
    };
  }

  return null;
}

function towerEvents(
  previous: EventState,
  state: EventState,
  snapshot: MatchSnapshot,
): (MatchEvent | null)[] {
  return [
    buildingEvent(
      previous.radiantTowers,
      state.radiantTowers,
      TOWER_NAMES,
      'radiant',
      snapshot.radiant.tag,
      'tower',
      50,
    ),
    buildingEvent(
      previous.direTowers,
      state.direTowers,
      TOWER_NAMES,
      'dire',
      snapshot.dire.tag,
      'tower',
      50,
    ),
  ];
}

function barracksEvents(
  previous: EventState,
  state: EventState,
  snapshot: MatchSnapshot,
): (MatchEvent | null)[] {
  return [
    buildingEvent(
      previous.radiantBarracks,
      state.radiantBarracks,
      BARRACKS_NAMES,
      'radiant',
      snapshot.radiant.tag,
      'barracks',
      85,
    ),
    buildingEvent(
      previous.direBarracks,
      state.direBarracks,
      BARRACKS_NAMES,
      'dire',
      snapshot.dire.tag,
      'barracks',
      85,
    ),
  ];
}

function buildingEvent(
  before: number | null,
  after: number | null,
  names: readonly string[],
  side: Side,
  tag: string,
  kind: 'tower' | 'barracks',
  priority: number,
): MatchEvent | null {
  if (before === null || after === null || before === after) {
    return null;
  }
  const fell = before & ~after;
  if (fell === 0) {
    return null;
  }

  const lost: string[] = [];
  for (let bit = 0; bit < names.length; bit += 1) {
    if (fell & (1 << bit)) {
      lost.push(names[bit] ?? `#${bit}`);
    }
  }

  if (lost.length === 0) {
    return null;
  }

  const noun =
    kind === 'tower'
      ? lost.length > 1
        ? BUILDING_WORDS.towerPlural
        : BUILDING_WORDS.towerSingular
      : BUILDING_WORDS.barracks;
  return {
    kind,
    side,
    text: EVENT_TEXT.building(tag, spellOut(lost), noun),

    priority: priority + lost.length,
    sound: true,
  };
}

function spellOut(lost: readonly string[]) {
  return lost
    .map((name) =>
      name
        .toLowerCase()
        .replace(/\bt(\d)\b/g, (_, digit: string) => BUILDING_WORDS.tier(digit))
        .replace(/\bbot\b/g, BUILDING_WORDS.bottom),
    )
    .join(' and ');
}

function killEvent(
  previous: EventState,
  state: EventState,
  snapshot: MatchSnapshot,
  heroName: HeroName,
): MatchEvent | null {
  const radiantGained = state.radiantKills - previous.radiantKills;
  const direGained = state.direKills - previous.direKills;
  if (radiantGained <= 0 && direGained <= 0) {
    return null;
  }

  const side: Side = radiantGained >= direGained ? 'radiant' : 'dire';
  const gained = Math.max(radiantGained, direGained);
  const killers = [
    ...risen(previous.radiantPlayers, state.radiantPlayers, 'kills'),
    ...risen(previous.direPlayers, state.direPlayers, 'kills'),
  ];
  const victims = [
    ...risen(previous.radiantPlayers, state.radiantPlayers, 'deaths'),
    ...risen(previous.direPlayers, state.direPlayers, 'deaths'),
  ];
  const killer =
    killers.length > 0
      ? killers.map((player) => labelOf(player, heroName)).join(' and ')
      : side === 'radiant'
        ? snapshot.radiant.tag
        : snapshot.dire.tag;

  return {
    kind: 'kill',
    side,
    text: EVENT_TEXT.kill(
      killer,
      victims.map((player) => labelOf(player, heroName)),
      gained,
    ),
    priority: 10,
    sound: false,
  };
}

function combatOf(players: MatchSnapshot['radiant']['players']) {
  return players.map((player) => ({
    heroId: player.heroId,
    name: player.name,
    kills: player.kills,
    deaths: player.deaths,
  }));
}

function risen(before: Combat[], after: Combat[], field: 'kills' | 'deaths') {
  const gained: Combat[] = [];
  for (const [index, now] of after.entries()) {
    const value = now[field];
    if (value === null) {
      continue;
    }

    const prev = previousOf(before, now, index)?.[field];
    if (prev === null || prev === undefined || value <= prev) {
      continue;
    }

    gained.push(now);
  }

  return gained;
}

function previousOf(before: Combat[], now: Combat, index: number) {
  if (now.heroId) {
    const match = before.find((player) => player.heroId === now.heroId);
    if (match) {
      return match;
    }
  }

  return before[index];
}

function labelOf(player: Combat, heroName: HeroName) {
  const hero = player.heroId ? heroName(player.heroId) : '';
  if (hero && !hero.startsWith('#')) {
    return hero;
  }

  if (player.name) {
    return player.name;
  }

  return hero || '?';
}
