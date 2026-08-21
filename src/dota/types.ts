export type Side = 'radiant' | 'dire';

export type PlayerState = {
  heroId: number;
  name: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  netWorth: number | null;
  level: number | null;
};

export type Draft = {
  picks: number[];
  bans: number[];
};

export type TeamState = {
  name: string;
  tag: string;
  kills: number;
  towers: number | null;
  towerState: number | null;
  barracksState: number | null;
  seriesWins: number;
  players: PlayerState[];
  draft: Draft;
};

export type MatchSnapshot = {
  live: boolean;
  matchId: string;
  leagueId: number;
  gameTimeSec: number;
  radiant: TeamState;
  dire: TeamState;
  netWorthLead: number;
  seriesType: number;
  spectators: number;
  delaySec: number;
  roshanRespawnSec: number | null;
  source: 'steam' | 'demo';
};

export function emptyTeam(name: string, tag: string): TeamState {
  return {
    name,
    tag,
    kills: 0,
    towers: null,
    towerState: null,
    barracksState: null,
    seriesWins: 0,
    players: [],
    draft: { picks: [], bans: [] },
  };
}

export function isDrafting(snapshot: MatchSnapshot) {
  if (snapshot.gameTimeSec > 0) {
    return false;
  }
  const entries =
    snapshot.radiant.draft.picks.length +
    snapshot.radiant.draft.bans.length +
    snapshot.dire.draft.picks.length +
    snapshot.dire.draft.bans.length;

  return entries > 0;
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
    roshanRespawnSec: null,
    source: 'steam',
  };
}

export function asciiName(name: string) {
  return name
    .replace(/[^ -~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveTag(name: string, fallback: string) {
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
