import { OpenDotaSource } from './opendota';
import { SteamSource } from './steam';
import {
  deriveTag,
  emptyTeam,
  type Draft,
  type MatchSnapshot,
  type PlayerState,
} from './types';

export type MatchSource = {
  readonly label: string;

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

const ALL_TOWERS = 0b111_1111_1111;

const ALL_BARRACKS = 0b11_1111;

const TOWER_FALLS = {
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

const BARRACKS_FALLS = {
  dire: [
    { bit: 2, minute: 29.2 },
    { bit: 3, minute: 29.4 },
  ],
  radiant: [],
} as const;

const ROSHAN_KILLS = [17, 26] as const;
const ROSHAN_RESPAWN_MIN = 9;

export const DEMO_GAME_MINUTES = 30;

const DEMO_SPEED = 20;

export class DemoSource implements MatchSource {
  readonly label = 'demo (synthetic match)';

  constructor(private readonly startedAt = Date.now()) {}

  poll(): Promise<MatchSnapshot | null> {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    const gameTimeSec = Math.round(elapsed * DEMO_SPEED) - 60;
    const minutes = Math.max(0, gameTimeSec / 60);

    if (minutes > DEMO_GAME_MINUTES) {
      return Promise.resolve(null);
    }

    const draftProgress = gameTimeSec <= 0 ? (gameTimeSec + 60) / 60 : 1;
    const radiantKills = killsBy(minutes, 0.58);
    const direKills = killsBy(minutes, 0.42);

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

function killsBy(minutes: number, perMinute: number) {
  const laning = Math.min(minutes, 10) * perMinute * 0.4;
  const rest = Math.max(0, minutes - 10) * perMinute * 1.3;

  return Math.floor(laning + rest);
}

type Fall = { readonly bit: number; readonly minute: number };

function maskAt(full: number, falls: readonly Fall[], minutes: number) {
  let mask = full;
  for (const fall of falls) {
    if (minutes >= fall.minute) {
      mask &= ~(1 << fall.bit);
    }
  }

  return mask;
}

function countStanding(falls: readonly Fall[], minutes: number, total: number) {
  return total - falls.filter((fall) => minutes >= fall.minute).length;
}

function roshanTimerAt(minutes: number) {
  let timer = 0;
  for (const killMinute of ROSHAN_KILLS) {
    if (minutes >= killMinute) {
      const remaining = ROSHAN_RESPAWN_MIN - (minutes - killMinute);
      timer = remaining > 0 ? Math.round(remaining * 60) : 0;
    }
  }

  return timer;
}

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
