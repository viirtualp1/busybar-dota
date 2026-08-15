import { radiantFillWidth } from '../bar/layout.js';
import type { MatchEvent } from '../domain/events.js';
import type { HeroCatalog } from '../dota/heroes.js';
import type { MatchSnapshot, TeamState } from '../dota/types.js';
import { COLORS } from './colors.js';
import { formatClock, formatGold, formatKda } from './format.js';

export type BackCell = { hero: string; stats: string };
export type BackRow = { left: BackCell | null; right: BackCell | null };

export type DotaFrame = {
  idle: boolean;
  scoreText: string;
  radiantTag: string;
  direTag: string;
  clockText: string;
  seriesText: string;
  /** Width in pixels of the Radiant half of the front display. */
  radiantFill: number;
  ledColor: string;
  backHeader: string;
  backSub: string;
  backRows: BackRow[];
};

export type FrameOptions = {
  heroes: HeroCatalog;
  maxRows: number;
  flash: MatchEvent;
  /** Shown on the back display while nothing is live. */
  idleNote: string;
};

const LED: Partial<Record<NonNullable<MatchEvent>, string>> = {
  'radiant-kill': COLORS.ledRadiant,
  'radiant-tower': COLORS.ledRadiant,
  'dire-kill': COLORS.ledDire,
  'dire-tower': COLORS.ledDire,
  'match-start': COLORS.ledStart,
};

export function buildFrame(snapshot: MatchSnapshot, options: FrameOptions): DotaFrame {
  if (!snapshot.live) {
    return idleFrame(options.idleNote, options.maxRows);
  }

  const lead = snapshot.netWorthLead;
  const leadText = lead === 0 ? 'even' : `${lead > 0 ? '+' : '-'}${formatGold(lead)}`;
  const leader = lead > 0 ? snapshot.radiant.tag : snapshot.dire.tag;

  return {
    idle: false,
    scoreText: `${snapshot.radiant.kills}-${snapshot.dire.kills}`,
    radiantTag: snapshot.radiant.tag,
    direTag: snapshot.dire.tag,
    clockText: formatClock(snapshot.gameTimeSec),
    seriesText: seriesText(snapshot),
    radiantFill: radiantFillWidth(lead),
    ledColor: (options.flash && LED[options.flash]) || '',
    backHeader: `${snapshot.radiant.name} vs ${snapshot.dire.name}`,
    backSub:
      lead === 0
        ? `even  ${towerText(snapshot)}`
        : `${leader} ${leadText}  ${towerText(snapshot)}`,
    backRows: backRows(snapshot, options),
  };
}

function seriesText(snapshot: MatchSnapshot): string {
  const wins = snapshot.radiant.seriesWins + snapshot.dire.seriesWins;
  if (snapshot.seriesType === 0 && wins === 0) {
    return '';
  }
  return `${snapshot.radiant.seriesWins}-${snapshot.dire.seriesWins}`;
}

function towerText(snapshot: MatchSnapshot): string {
  const { towers: radiant } = snapshot.radiant;
  const { towers: dire } = snapshot.dire;
  if (radiant === null || dire === null) {
    return '';
  }
  return `T ${radiant}-${dire}`;
}

function backRows(snapshot: MatchSnapshot, options: FrameOptions): BackRow[] {
  const rows: BackRow[] = [];
  for (let index = 0; index < options.maxRows; index += 1) {
    rows.push({
      left: cell(snapshot.radiant, index, options),
      right: cell(snapshot.dire, index, options),
    });
  }
  return rows;
}

function cell(team: TeamState, index: number, options: FrameOptions): BackCell | null {
  const player = team.players[index];
  if (!player) {
    return null;
  }
  const kda = formatKda(player.kills, player.deaths, player.assists);
  // OpenDota has no per-player scoreboard; fall back to whatever it does give.
  const stats = kda || (player.netWorth !== null ? formatGold(player.netWorth) : '');
  return { hero: options.heroes.name(player.heroId), stats };
}

function idleFrame(note: string, maxRows: number): DotaFrame {
  return {
    idle: true,
    scoreText: 'DOTA',
    radiantTag: '',
    direTag: '',
    clockText: '',
    seriesText: '',
    radiantFill: radiantFillWidth(0),
    ledColor: '',
    backHeader: 'No live match',
    backSub: note,
    backRows: Array.from({ length: maxRows }, () => ({ left: null, right: null })),
  };
}
