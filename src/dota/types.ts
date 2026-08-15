export type Side = 'radiant' | 'dire';

export type PlayerState = {
  heroId: number;
  /** Empty when the source does not expose names (OpenDota hides most). */
  name: string;
  /** Steam-only. `null` where the source has no per-player scoreboard. */
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  netWorth: number | null;
  level: number | null;
};

export type TeamState = {
  name: string;
  /** Short tag for the 72px front display. Derived when the API omits it. */
  tag: string;
  /** Kill count — what the scoreboard calls "score". */
  kills: number;
  /** Towers still standing, 0..11. `null` when the source omits building state. */
  towers: number | null;
  /** Games won in the current series. */
  seriesWins: number;
  players: PlayerState[];
};

export type MatchSnapshot = {
  /** False means "nothing live to show" — the app draws an idle screen. */
  live: boolean;
  matchId: string;
  leagueId: number;
  /** Negative during the horn countdown, which is exactly what the clock should show. */
  gameTimeSec: number;
  radiant: TeamState;
  dire: TeamState;
  /** Positive means Radiant is ahead. */
  netWorthLead: number;
  /** 0 = unknown/bo1, 1 = bo3, 2 = bo5. */
  seriesType: number;
  spectators: number;
  /** Broadcast delay in seconds — you are always watching the past. */
  delaySec: number;
  source: 'steam' | 'opendota' | 'demo';
};

export function emptyTeam(name: string, tag: string): TeamState {
  return { name, tag, kills: 0, towers: null, seriesWins: 0, players: [] };
}

export function idleSnapshot(): MatchSnapshot {
  return {
    live: false,
    matchId: '',
    leagueId: 0,
    gameTimeSec: 0,
    radiant: emptyTeam('Radiant', 'RAD'),
    dire: emptyTeam('Dire', 'DIR'),
    netWorthLead: 0,
    seriesType: 0,
    spectators: 0,
    delaySec: 0,
    source: 'opendota',
  };
}

/**
 * Squeezes a team name into something that fits 72px of tiny font.
 * Prefers a real tag; otherwise takes initials, then a truncation.
 */
export function deriveTag(name: string, fallback: string): string {
  const clean = name.trim();
  if (!clean) {
    return fallback;
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase();
  }
  return clean.slice(0, 3).toUpperCase();
}
