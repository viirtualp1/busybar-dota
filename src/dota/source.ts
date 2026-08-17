import { OpenDotaSource } from './opendota.js';
import { SteamSource } from './steam.js';
import {
  deriveTag,
  emptyTeam,
  type Draft,
  type MatchSnapshot,
  type PlayerState,
} from './types.js';

export type MatchSource = {
  readonly label: string;
  /** `null` means "connected fine, but nothing is live right now". */
  poll(): Promise<MatchSnapshot | null>;
};

export type SourceOptions = {
  steamApiKey: string;
  leagueId: number;
  matchId: string;
  timeoutMs: number;
};

export function createSource(options: SourceOptions, demo: boolean): MatchSource {
  if (demo) {
    return new DemoSource();
  }
  if (options.steamApiKey) {
    const steam = new SteamSource({
      apiKey: options.steamApiKey,
      leagueId: options.leagueId,
      matchId: options.matchId,
      timeoutMs: options.timeoutMs,
    });
    return { label: 'Steam GetLiveLeagueGames', poll: () => steam.poll() };
  }
  const openDota = new OpenDotaSource({
    leagueId: options.leagueId,
    matchId: options.matchId,
    timeoutMs: options.timeoutMs,
  });
  return { label: 'OpenDota /live (no per-player stats)', poll: () => openDota.poll() };
}

const DEMO_HEROES = {
  radiant: [8, 74, 5, 26, 87],
  dire: [11, 41, 19, 31, 86],
} as const;

const DEMO_BANS = {
  radiant: [1, 14, 47, 63, 81, 90, 114],
  dire: [6, 21, 44, 53, 79, 92, 123],
} as const;

const DEMO_PLAYERS = {
  radiant: ['Yatoro', 'Larl', 'Collapse', 'Mira', 'Miposhka'],
  dire: ['skiter', 'Malr1ne', 'ATF', 'Cr1t-', 'Sneyking'],
} as const;

/** All eleven towers standing. */
const ALL_TOWERS = 0b111_1111_1111;
/** All six barracks standing. */
const ALL_BARRACKS = 0b11_1111;

/**
 * When each tower bit falls, in game minutes. Ordered the way a real game goes:
 * a safe-lane tier 1 early, tier 3s and tier 4s only near the end.
 *
 * Bit layout matches `tower_state`: 0-2 top T1..T3, 3-5 mid, 6-8 bottom,
 * 9-10 the two tier 4s.
 */
const TOWER_FALLS = {
  // The losing side loses more, and loses it sooner.
  dire: [
    { bit: 6, minute: 9 },
    { bit: 3, minute: 13 },
    { bit: 0, minute: 16 },
    { bit: 4, minute: 20 },
    { bit: 7, minute: 22 },
    { bit: 5, minute: 25 },
    { bit: 1, minute: 27 },
    { bit: 9, minute: 28.5 },
    { bit: 10, minute: 29 },
  ],
  radiant: [
    { bit: 3, minute: 12 },
    { bit: 6, minute: 18 },
    { bit: 0, minute: 24 },
  ],
} as const;

/** Mid racks fall right before the end, which is what ends games. */
const BARRACKS_FALLS = {
  dire: [
    { bit: 2, minute: 29.2 },
    { bit: 3, minute: 29.4 },
  ],
  radiant: [],
} as const;

/** Roshan dies twice in a normal game; the timer jumps on each kill. */
const ROSHAN_KILLS = [17, 26] as const;
const ROSHAN_RESPAWN_MIN = 9;

/** A pro game runs about half an hour. */
export const DEMO_GAME_MINUTES = 30;
/** 20x speed: draft plus a full game plays out in about a minute and a half. */
const DEMO_SPEED = 20;

/**
 * A synthetic match.
 *
 * TI games only run during Shanghai daytime, so without this the display can
 * only be developed for a few hours a day. Shaped like a real game rather than a
 * stress test: it ends at the thirty minute mark, the kill count stays in the
 * twenties, and towers, Roshan and barracks land in a plausible order so every
 * ticker line can actually be seen.
 */
export class DemoSource implements MatchSource {
  readonly label = 'demo (synthetic match)';

  /**
   * `startedAt` in the past fast-forwards the match. The draft window is only
   * three real seconds wide, so a screenshot of it has to be asked for by
   * seeking rather than waited for.
   */
  constructor(private readonly startedAt = Date.now()) {}

  poll(): Promise<MatchSnapshot | null> {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    const gameTimeSec = Math.round(elapsed * DEMO_SPEED) - 60;
    const minutes = Math.max(0, gameTimeSec / 60);

    // Past the final horn the game simply stops being live, which is what the
    // real feed does and what the series-break view needs to see.
    if (minutes > DEMO_GAME_MINUTES) {
      return Promise.resolve(null);
    }

    const draftProgress = gameTimeSec <= 0 ? (gameTimeSec + 60) / 60 : 1;
    const radiantKills = killsBy(minutes, 0.58);
    const direKills = killsBy(minutes, 0.42);
    // Dead even at the horn, diverging as the game goes. The swing amplitude
    // grows with time too, or the bar looks lopsided at 1-1 when both teams have
    // barely farmed anything.
    const netWorthLead = Math.round(
      minutes * 60 * Math.sin(minutes / 4) + minutes * minutes * 10,
    );

    return Promise.resolve({
      live: true,
      matchId: 'demo',
      leagueId: 0,
      gameTimeSec,
      radiant: {
        ...emptyTeam('Team Spirit', deriveTag('Team Spirit', 'RAD')),
        kills: radiantKills,
        towers: countStanding(TOWER_FALLS.radiant, minutes, 11),
        towerState: maskAt(ALL_TOWERS, TOWER_FALLS.radiant, minutes),
        barracksState: maskAt(ALL_BARRACKS, BARRACKS_FALLS.radiant, minutes),
        seriesWins: 1,
        players: demoPlayers(
          DEMO_HEROES.radiant,
          DEMO_PLAYERS.radiant,
          radiantKills,
          direKills,
          minutes,
        ),
        draft: demoDraft(DEMO_HEROES.radiant, DEMO_BANS.radiant, draftProgress),
      },
      dire: {
        ...emptyTeam('Falcons', deriveTag('Falcons', 'DIR')),
        kills: direKills,
        towers: countStanding(TOWER_FALLS.dire, minutes, 11),
        towerState: maskAt(ALL_TOWERS, TOWER_FALLS.dire, minutes),
        barracksState: maskAt(ALL_BARRACKS, BARRACKS_FALLS.dire, minutes),
        seriesWins: 0,
        players: demoPlayers(
          DEMO_HEROES.dire,
          DEMO_PLAYERS.dire,
          direKills,
          radiantKills,
          minutes,
        ),
        draft: demoDraft(DEMO_HEROES.dire, DEMO_BANS.dire, draftProgress),
      },
      netWorthLead,
      seriesType: 1,
      spectators: 812_345,
      delaySec: 120,
      roshanRespawnSec: roshanTimerAt(minutes),
      source: 'demo',
    });
  }
}

/**
 * Kills come in bursts, not at a steady rate, so the curve is bent to give a
 * quiet laning phase and a busier midgame.
 */
function killsBy(minutes: number, perMinute: number): number {
  const laning = Math.min(minutes, 10) * perMinute * 0.4;
  const rest = Math.max(0, minutes - 10) * perMinute * 1.3;
  return Math.floor(laning + rest);
}

type Fall = { readonly bit: number; readonly minute: number };

function maskAt(full: number, falls: readonly Fall[], minutes: number): number {
  let mask = full;
  for (const fall of falls) {
    if (minutes >= fall.minute) {
      mask &= ~(1 << fall.bit);
    }
  }
  return mask;
}

function countStanding(falls: readonly Fall[], minutes: number, total: number): number {
  return total - falls.filter((fall) => minutes >= fall.minute).length;
}

/** Counts down between kills, and jumps back up on each one. */
function roshanTimerAt(minutes: number): number {
  let timer = 0;
  for (const killMinute of ROSHAN_KILLS) {
    if (minutes >= killMinute) {
      const remaining = ROSHAN_RESPAWN_MIN - (minutes - killMinute);
      timer = remaining > 0 ? Math.round(remaining * 60) : 0;
    }
  }
  return timer;
}

/** Bans land before picks in a real draft, so they fill first. */
function demoDraft(
  heroes: readonly number[],
  bans: readonly number[],
  progress: number,
): Draft {
  const clamped = Math.max(0, Math.min(1, progress));
  const banShare = Math.min(1, clamped / 0.6);
  const pickShare = Math.max(0, (clamped - 0.4) / 0.6);
  return {
    bans: bans.slice(0, Math.round(banShare * bans.length)),
    picks: heroes.slice(0, Math.round(pickShare * heroes.length)),
  };
}

function demoPlayers(
  heroes: readonly number[],
  names: readonly string[],
  teamKills: number,
  enemyKills: number,
  minutes: number,
): PlayerState[] {
  return heroes.map((heroId, index) => ({
    heroId,
    name: names[index] ?? `player${index + 1}`,
    kills: Math.floor(teamKills / heroes.length) + (index === 0 ? teamKills % 5 : 0),
    deaths: Math.floor(enemyKills / heroes.length),
    assists: Math.floor(teamKills * 0.6),
    netWorth: Math.round(600 + minutes * (700 - index * 90)),
    level: Math.min(30, 1 + Math.floor(minutes * 0.9)),
  }));
}
