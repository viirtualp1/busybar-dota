import type { MatchSnapshot } from '../dota/types.js';

export type Side = 'radiant' | 'dire';

export type MatchEventKind =
  | 'match-start'
  | 'match-end'
  | 'kill'
  | 'tower'
  | 'barracks'
  | 'roshan';

export type MatchEvent = {
  kind: MatchEventKind;
  /** Which team it happened *to* for buildings, and *for* on kills. */
  side: Side | null;
  /**
   * One full sentence, written out. The front display scrolls it when it does
   * not fit rather than abbreviating — `FAL MID RAX` saved pixels and lost the
   * meaning.
   */
  text: string;
  /**
   * Only one event is shown per poll, so ties are broken by how rare and
   * consequential the thing is: the game ending, then racks (they usually decide
   * it), then Roshan, then a tower. A kill loses to everything — there are
   * dozens of them.
   */
  priority: number;
  /** Kills are silent on purpose — one chirp per kill is a machine gun. */
  sound: boolean;
};


/**
 * Every word that reaches the display, in one place.
 *
 * This is the file to edit to reword an event — nothing below builds a sentence
 * of its own. Keep it **plain ASCII**: the Bar draws a placeholder box for
 * glyphs its font lacks, so an em dash or a middle dot arrives as a stray
 * rectangle. `assertAscii` in the tests guards that.
 *
 * Lines longer than the front display are paged on word boundaries, so long
 * wording is fine — it just takes another 2.2 seconds to read.
 */
export const EVENT_TEXT = {
  matchStart: (radiant: string, dire: string): string =>
    `Game on: ${radiant} vs ${dire}`,
  matchEnd: (): string => 'Game over',
  roshan: (respawnMin: number): string =>
    `Roshan killed, respawns in ${respawnMin} min`,
  /** `what` is already spelled out, e.g. `mid tier 2`. */
  building: (tag: string, what: string, noun: string): string =>
    `${tag} lost ${what} ${noun}`,
  kill: (tag: string, gained: number, score: string): string =>
    `${tag} ${gained > 1 ? `${gained} kills` : 'kill'}, ${score}`,
} as const;

/** How buildings are named once written out. Edit here to rename a lane. */
export const BUILDING_WORDS = {
  tier: (n: string): string => `tier ${n}`,
  top: 'top',
  mid: 'mid',
  bottom: 'bottom',
  melee: 'melee',
  ranged: 'ranged',
  towerSingular: 'tower',
  towerPlural: 'towers',
  /** Already plural in English; "barrackss" is not a word. */
  barracks: 'barracks',
} as const;

/**
 * `tower_state` bit layout, per team.
 *
 * Bits 9 and 10 are the two tier-4 towers; which is which is not worth
 * asserting, so both are labelled `T4` and the ambiguity disappears.
 */
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

/** `barracks_state` bit layout, per team. */
const BARRACKS_NAMES = [
  'TOP MELEE',
  'TOP RANGED',
  'MID MELEE',
  'MID RANGED',
  'BOT MELEE',
  'BOT RANGED',
] as const;

/**
 * Roshan's respawn window is eight to eleven minutes, so a timer jumping above
 * this from nothing means he just died rather than the clock ticking down.
 */
const ROSHAN_KILL_THRESHOLD_SEC = 60;

export type EventState = {
  matchId: string;
  radiantKills: number;
  direKills: number;
  radiantTowers: number | null;
  direTowers: number | null;
  radiantBarracks: number | null;
  direBarracks: number | null;
  roshanRespawnSec: number | null;
  live: boolean;
};

export const initialEventState: EventState = {
  matchId: '',
  radiantKills: 0,
  direKills: 0,
  radiantTowers: null,
  direTowers: null,
  radiantBarracks: null,
  direBarracks: null,
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
    roshanRespawnSec: snapshot.roshanRespawnSec,
    live: snapshot.live,
  };
}

/**
 * Compares two polls and reports the single most interesting thing that changed.
 *
 * One event per poll: at a five-second cadence several things happen at once,
 * and flashing the bar twice in one frame reads as a glitch rather than a
 * teamfight.
 */
export function detectEvent(
  previous: EventState,
  snapshot: MatchSnapshot,
): { event: MatchEvent | null; state: EventState } {
  const state = stateOf(snapshot);

  // A new match resets every counter, so treat it as a start rather than
  // reporting a phantom twenty-kill swing.
  if (previous.matchId !== state.matchId) {
    return {
      event: state.live
        ? {
            kind: 'match-start',
            side: null,
            text: EVENT_TEXT.matchStart(snapshot.radiant.name, snapshot.dire.name),
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
    killEvent(previous, state, snapshot),
  ].filter((event): event is MatchEvent => event !== null);

  const best = candidates.reduce<MatchEvent | null>(
    (winner, event) => (winner === null || event.priority > winner.priority ? event : winner),
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
      text: EVENT_TEXT.roshan(Math.round(after / 60)),
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

/**
 * A building falls when its bit clears. A `null` on either side means the source
 * does not report that mask at all, which is not the same as nothing falling.
 */
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
    // A double loss in one poll is a bigger deal than a single one.
    priority: priority + lost.length,
    sound: true,
  };
}

/** `MID T2` reads as `mid tier 2` when there is room to say it properly. */
function spellOut(lost: readonly string[]): string {
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
): MatchEvent | null {
  const radiantGained = state.radiantKills - previous.radiantKills;
  const direGained = state.direKills - previous.direKills;
  if (radiantGained <= 0 && direGained <= 0) {
    return null;
  }
  const side: Side = radiantGained >= direGained ? 'radiant' : 'dire';
  const tag = side === 'radiant' ? snapshot.radiant.tag : snapshot.dire.tag;
  const gained = Math.max(radiantGained, direGained);
  const score = `${snapshot.radiant.kills}-${snapshot.dire.kills}`;

  return {
    kind: 'kill',
    side,
    text: EVENT_TEXT.kill(tag, gained, score),
    priority: 10,
    sound: false,
  };
}
