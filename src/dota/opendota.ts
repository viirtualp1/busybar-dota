/**
 * OpenDota `/live` — the keyless fallback.
 *
 * Gives team names, kills, net worth lead and building state, but no per-player
 * scoreboard and no draft. Enough for the front display, thin on the back one.
 * Verified shape: `radiant_lead`, `radiant_score`, `dire_score`, `game_time`,
 * `building_state`, `team_name_radiant`, `players[].hero_id`.
 */
import {
  deriveTag,
  emptyTeam,
  type MatchSnapshot,
  type PlayerState,
  type TeamState,
} from './types.js';
import { asId, countBits } from './steam.js';

const ENDPOINT = 'https://api.opendota.com/api/live';

/**
 * `building_state` packs both teams. The low 11 bits are Radiant towers, the
 * next 11 are Dire towers; barracks live above those.
 */
const TOWER_BITS = 11;
const TOWER_MASK = (1 << TOWER_BITS) - 1;
const DIRE_TOWER_SHIFT = 11;

export type OpenDotaOptions = {
  leagueId: number;
  matchId: string;
  timeoutMs: number;
};

export class OpenDotaSource {
  constructor(
    private readonly options: OpenDotaOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async poll(): Promise<MatchSnapshot | null> {
    const response = await this.fetchImpl(ENDPOINT, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OpenDota responded ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      return null;
    }

    const games = body.filter(isRecord).filter((game) => {
      if (this.options.matchId) {
        return asId(game['match_id']) === this.options.matchId;
      }
      if (this.options.leagueId) {
        return num(game['league_id']) === this.options.leagueId;
      }
      // Without a filter, only tournament games are interesting — pubs have
      // league_id 0 and would otherwise drown out the real match.
      return num(game['league_id']) > 0;
    });

    if (games.length === 0) {
      return null;
    }
    const game = games.reduce((best, current) =>
      num(current['spectators']) > num(best['spectators']) ? current : best,
    );
    return toSnapshot(game);
  }
}

function toSnapshot(game: Record<string, unknown>): MatchSnapshot {
  const buildingState = game['building_state'];
  const buildings = buildingState === undefined ? null : num(buildingState);
  const roster = players(game['players']);

  // Only the tower halves of `building_state` are read: the barracks bits sit
  // above them but their exact offsets are not documented, and guessing would
  // announce racks that never fell.
  const radiantTowers = buildings === null ? null : buildings & TOWER_MASK;
  const direTowers =
    buildings === null ? null : (buildings >> DIRE_TOWER_SHIFT) & TOWER_MASK;

  const radiant = team(
    str(game['team_name_radiant']) || 'Radiant',
    'RAD',
    num(game['radiant_score']),
    radiantTowers,
    roster.filter((player) => player.side === 0).map((player) => player.state),
  );
  const dire = team(
    str(game['team_name_dire']) || 'Dire',
    'DIR',
    num(game['dire_score']),
    direTowers,
    roster.filter((player) => player.side === 1).map((player) => player.state),
  );

  return {
    live: true,
    matchId: asId(game['match_id']),
    leagueId: num(game['league_id']),
    gameTimeSec: Math.round(num(game['game_time'])),
    radiant,
    dire,
    netWorthLead: num(game['radiant_lead']),
    seriesType: 0,
    spectators: num(game['spectators']),
    delaySec: num(game['delay']),
    // OpenDota's live feed does not expose a Roshan timer.
    roshanRespawnSec: null,
    source: 'opendota',
  };
}

function team(
  name: string,
  fallbackTag: string,
  kills: number,
  towerState: number | null,
  roster: PlayerState[],
): TeamState {
  return {
    ...emptyTeam(name, deriveTag(name, fallbackTag)),
    kills,
    towers: towerState === null ? null : countBits(towerState, TOWER_BITS),
    towerState,
    players: roster,
  };
}

function players(raw: unknown): { side: number; state: PlayerState }[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isRecord).map((player) => ({
    side: num(player['team']),
    state: {
      heroId: num(player['hero_id']),
      name: str(player['name']),
      kills: null,
      deaths: null,
      assists: null,
      netWorth: null,
      level: null,
    },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
