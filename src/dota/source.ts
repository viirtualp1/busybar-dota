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

/**
 * A synthetic match.
 *
 * TI games only run during Shanghai daytime, so without this the display can
 * only be developed for a few hours a day. The numbers are plausible rather
 * than accurate — the point is to exercise every branch of the renderer,
 * including tower falls and lead swings across zero.
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
    // 20x speed: a full 40-minute game plays out in two minutes.
    const gameTimeSec = Math.round(elapsed * 20) - 60;
    const minutes = Math.max(0, gameTimeSec / 60);
    // The first three seconds sit at or below zero, which is the draft window.
    const draftProgress = gameTimeSec <= 0 ? (gameTimeSec + 60) / 60 : 1;

    const radiantKills = Math.floor(minutes * 0.9);
    const direKills = Math.floor(minutes * 0.75);
    // A slow sine so the lead crosses zero and both colours get exercised.
    const netWorthLead = Math.round(9000 * Math.sin(minutes / 4) + minutes * 120);

    return Promise.resolve({
      live: true,
      matchId: 'demo',
      leagueId: 0,
      gameTimeSec,
      radiant: {
        ...emptyTeam('Team Spirit', deriveTag('Team Spirit', 'RAD')),
        kills: radiantKills,
        towers: 11 - Math.min(11, Math.floor(minutes / 5)),
        seriesWins: 1,
        players: demoPlayers(DEMO_HEROES.radiant, radiantKills, direKills, minutes),
        draft: demoDraft(DEMO_HEROES.radiant, DEMO_BANS.radiant, draftProgress),
      },
      dire: {
        ...emptyTeam('Falcons', deriveTag('Falcons', 'DIR')),
        kills: direKills,
        towers: 11 - Math.min(11, Math.floor(minutes / 6)),
        seriesWins: 0,
        players: demoPlayers(DEMO_HEROES.dire, direKills, radiantKills, minutes),
        draft: demoDraft(DEMO_HEROES.dire, DEMO_BANS.dire, draftProgress),
      },
      netWorthLead,
      seriesType: 1,
      spectators: 812_345,
      delaySec: 120,
      source: 'demo',
    });
  }
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
  teamKills: number,
  enemyKills: number,
  minutes: number,
): PlayerState[] {
  return heroes.map((heroId, index) => ({
    heroId,
    name: `player${index + 1}`,
    kills: Math.floor(teamKills / heroes.length) + (index === 0 ? teamKills % 5 : 0),
    deaths: Math.floor(enemyKills / heroes.length),
    assists: Math.floor(teamKills * 0.6),
    netWorth: Math.round(600 + minutes * (700 - index * 90)),
    level: Math.min(30, 1 + Math.floor(minutes * (0.9 - index * 0.08))),
  }));
}
