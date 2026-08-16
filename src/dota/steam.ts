/**
 * Steam Web API `GetLiveLeagueGames`.
 *
 * The richest live source: per-player scoreboard, tower state, series score.
 * Needs a free key from https://steamcommunity.com/dev/apikey.
 */
import {
  deriveTag,
  emptyTeam,
  type MatchSnapshot,
  type PlayerState,
  type TeamState,
} from './types.js';

const ENDPOINT = 'https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/';

/** Radiant and Dire each have 11 towers; `tower_state` is a bitmask over them. */
const TOWER_BITS = 11;

export type SteamOptions = {
  apiKey: string;
  /** 0 means "any league". */
  leagueId: number;
  /** Empty means "pick the most watched game". */
  matchId: string;
  timeoutMs: number;
};

export class SteamSource {
  constructor(
    private readonly options: SteamOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async poll(): Promise<MatchSnapshot | null> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('key', this.options.apiKey);
    if (this.options.leagueId) {
      url.searchParams.set('league_id', String(this.options.leagueId));
    }

    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'Steam rejected the key (403) — check STEAM_API_KEY'
          : `Steam responded ${response.status}`,
      );
    }

    const body: unknown = await response.json();
    const games = readGames(body);
    const game = pickGame(games, this.options.matchId);
    return game ? toSnapshot(game) : null;
  }
}

type RawGame = Record<string, unknown>;

function readGames(body: unknown): RawGame[] {
  if (!isRecord(body)) {
    return [];
  }
  const result = body['result'];
  if (!isRecord(result)) {
    return [];
  }
  const games = result['games'];
  return Array.isArray(games) ? games.filter(isRecord) : [];
}

function pickGame(games: RawGame[], matchId: string): RawGame | null {
  if (games.length === 0) {
    return null;
  }
  if (matchId) {
    return games.find((game) => asId(game['match_id']) === matchId) ?? null;
  }
  // During a tournament the main stage game reliably has the most spectators.
  return games.reduce((best, game) =>
    num(game['spectators']) > num(best['spectators']) ? game : best,
  );
}

function toSnapshot(game: RawGame): MatchSnapshot {
  const scoreboard = isRecord(game['scoreboard']) ? game['scoreboard'] : {};
  const radiantBoard = isRecord(scoreboard['radiant']) ? scoreboard['radiant'] : {};
  const direBoard = isRecord(scoreboard['dire']) ? scoreboard['dire'] : {};

  const radiant = team(
    game['radiant_team'],
    radiantBoard,
    num(game['radiant_series_wins']),
    'Radiant',
    'RAD',
  );
  const dire = team(
    game['dire_team'],
    direBoard,
    num(game['dire_series_wins']),
    'Dire',
    'DIR',
  );

  return {
    live: true,
    matchId: asId(game['match_id']),
    leagueId: num(game['league_id']),
    gameTimeSec: Math.round(num(scoreboard['duration'])),
    radiant,
    dire,
    netWorthLead: totalNetWorth(radiant) - totalNetWorth(dire),
    seriesType: num(game['series_type']),
    spectators: num(game['spectators']),
    delaySec: num(game['stream_delay_s']),
    source: 'steam',
  };
}

function team(
  rawTeam: unknown,
  board: Record<string, unknown>,
  seriesWins: number,
  fallbackName: string,
  fallbackTag: string,
): TeamState {
  const info = isRecord(rawTeam) ? rawTeam : {};
  const name = str(info['team_name']) || fallbackName;
  const towerState = board['tower_state'];

  return {
    ...emptyTeam(name, deriveTag(name, fallbackTag)),
    kills: num(board['score']),
    towers: towerState === undefined ? null : countBits(num(towerState), TOWER_BITS),
    seriesWins,
    players: players(board['players']),
    draft: {
      picks: heroIds(board['picks']),
      bans: heroIds(board['bans']),
    },
  };
}

/** `picks` and `bans` arrive as `[{hero_id}]`, in draft order. */
function heroIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(isRecord)
    .map((entry) => num(entry['hero_id']))
    .filter((heroId) => heroId > 0);
}

function players(raw: unknown): PlayerState[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isRecord).map((player) => ({
    heroId: num(player['hero_id']),
    name: str(player['name']),
    kills: numOrNull(player['kills']),
    // The Steam scoreboard really does call it `death`, singular.
    deaths: numOrNull(player['death']),
    assists: numOrNull(player['assists']),
    netWorth: numOrNull(player['net_worth']),
    level: numOrNull(player['level']),
  }));
}

function totalNetWorth(state: TeamState): number {
  return state.players.reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
}

export function countBits(value: number, bits: number): number {
  let count = 0;
  for (let bit = 0; bit < bits; bit += 1) {
    if (value & (1 << bit)) {
      count += 1;
    }
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Match ids arrive as either a JSON number or a string depending on the source. */
export function asId(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
