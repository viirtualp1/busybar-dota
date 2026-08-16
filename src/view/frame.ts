import { radiantFillWidth } from '../bar/layout.js';
import type { MatchEvent } from '../domain/events.js';
import type { HeroCatalog } from '../dota/heroes.js';
import { isDrafting, type MatchSnapshot, type TeamState } from '../dota/types.js';
import { COLORS } from './colors.js';
import { formatClock, formatGold, formatKda } from './format.js';

export type BackCell = { hero: string; stats: string };
export type BackRow = { left: BackCell | null; right: BackCell | null };

export type DotaFrame = {
  idle: boolean;
  /** Draft phase: the back display shows picks and bans instead of the roster. */
  drafting: boolean;
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
  const drafting = isDrafting(snapshot);

  return {
    idle: false,
    drafting,
    scoreText: `${snapshot.radiant.kills}-${snapshot.dire.kills}`,
    radiantTag: snapshot.radiant.tag,
    direTag: snapshot.dire.tag,
    // The horn countdown is not interesting while the heroes are still being
    // chosen; saying so outright is.
    clockText: drafting ? 'DRAFT' : formatClock(snapshot.gameTimeSec),
    seriesText: seriesText(snapshot),
    radiantFill: radiantFillWidth(lead),
    ledColor: (options.flash && LED[options.flash]) || '',
    // Left name is the left column, right name is the right column — the header
    // is what makes the divider mean something.
    backHeader: `${snapshot.radiant.name} | ${snapshot.dire.name}`,
    backSub: drafting
      ? banSummary(snapshot, options)
      : lead === 0
        ? `even  ${towerText(snapshot)}`
        : `${leader} ${leadText}  ${towerText(snapshot)}`,
    backRows: drafting ? draftRows(snapshot, options) : backRows(snapshot, options),
  };
}

/**
 * Fourteen banned heroes will never fit as names, so the summary is the count
 * plus each side's most recent ban — the one still being talked about.
 */
function banSummary(snapshot: MatchSnapshot, options: FrameOptions): string {
  const radiant = snapshot.radiant.draft.bans;
  const dire = snapshot.dire.draft.bans;
  const counts = `BANS ${radiant.length}-${dire.length}`;
  const lastRadiant = radiant.at(-1);
  const lastDire = dire.at(-1);
  if (lastRadiant === undefined && lastDire === undefined) {
    return counts;
  }
  const left = lastRadiant === undefined ? '-' : options.heroes.name(lastRadiant);
  const right = lastDire === undefined ? '-' : options.heroes.name(lastDire);
  return `${counts}  ${left} / ${right}`;
}

function draftRows(snapshot: MatchSnapshot, options: FrameOptions): BackRow[] {
  const rows: BackRow[] = [];
  for (let index = 0; index < options.maxRows; index += 1) {
    rows.push({
      left: pickCell(snapshot.radiant, index, options),
      right: pickCell(snapshot.dire, index, options),
    });
  }
  return rows;
}

function pickCell(
  team: TeamState,
  index: number,
  options: FrameOptions,
): BackCell | null {
  const heroId = team.draft.picks[index];
  if (heroId === undefined) {
    return null;
  }
  // Pick order matters in Dota drafting, so it earns the stats column.
  return { hero: options.heroes.name(heroId), stats: `#${index + 1}` };
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
    drafting: false,
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
