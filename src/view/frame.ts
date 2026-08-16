import { radiantFillWidth } from '../bar/layout.js';
import type { MatchEvent } from '../domain/events.js';
import type { HeroCatalog } from '../dota/heroes.js';
import type { Schedule } from '../dota/schedule/index.js';
import { isDrafting, type MatchSnapshot, type TeamState } from '../dota/types.js';
import { COLORS } from './colors.js';
import {
  formatClock,
  formatCountdown,
  formatGold,
  formatKda,
  formatStartDate,
  formatStartTime,
} from './format.js';

export type BackCell = { hero: string; stats: string };

/**
 * Rosters and drafts are two columns; a bracket is not. Modelling that as a
 * union keeps the renderer from having to guess which one it is looking at.
 */
export type BackRow =
  | { kind: 'pair'; left: BackCell | null; right: BackCell | null }
  | { kind: 'wide'; label: string; text: string; highlight: boolean };

export type FrameMode = 'live' | 'draft' | 'upcoming' | 'idle';

export type DotaFrame = {
  mode: FrameMode;
  scoreText: string;
  radiantTag: string;
  direTag: string;
  clockText: string;
  seriesText: string;
  /** Width in pixels of the Radiant half of the front display. */
  radiantFill: number;
  /** Only a live game has a meaningful net worth split to colour. */
  showBands: boolean;
  /** The column rule belongs to two-column layouts only. */
  showDivider: boolean;
  ledColor: string;
  backHeader: string;
  backSub: string;
  backRows: BackRow[];
};

export type FrameOptions = {
  heroes: HeroCatalog;
  maxRows: number;
  flash: MatchEvent;
  /** Wall-clock time, needed for the countdown. */
  nowEpochMs: number;
  /** `null` when no schedule source is configured or it is unreachable. */
  schedule: Schedule | null;
  /** Shown on the back display when there is nothing at all to show. */
  idleNote: string;
};

const LED: Partial<Record<NonNullable<MatchEvent>, string>> = {
  'radiant-kill': COLORS.ledRadiant,
  'radiant-tower': COLORS.ledRadiant,
  'dire-kill': COLORS.ledDire,
  'dire-tower': COLORS.ledDire,
  'match-start': COLORS.ledStart,
};

const emptyRow: BackRow = { kind: 'pair', left: null, right: null };

export function buildFrame(snapshot: MatchSnapshot, options: FrameOptions): DotaFrame {
  if (!snapshot.live) {
    return options.schedule?.next
      ? upcomingFrame(options.schedule, options)
      : idleFrame(options.idleNote, options.maxRows);
  }

  const lead = snapshot.netWorthLead;
  const leadText = lead === 0 ? 'even' : `${lead > 0 ? '+' : '-'}${formatGold(lead)}`;
  const leader = lead > 0 ? snapshot.radiant.tag : snapshot.dire.tag;
  const drafting = isDrafting(snapshot);

  return {
    mode: drafting ? 'draft' : 'live',
    scoreText: `${snapshot.radiant.kills}-${snapshot.dire.kills}`,
    radiantTag: snapshot.radiant.tag,
    direTag: snapshot.dire.tag,
    // The horn countdown is not interesting while the heroes are still being
    // chosen; saying so outright is.
    clockText: drafting ? 'DRAFT' : formatClock(snapshot.gameTimeSec),
    seriesText: seriesText(snapshot),
    radiantFill: radiantFillWidth(lead),
    showBands: true,
    showDivider: true,
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
 * Between games: the countdown is the headline, the bracket is the context.
 *
 * Reuses the live layout's slots rather than inventing new ones — the score
 * position becomes the countdown, the clock position the start time — so the
 * display keeps its shape and the element ids stay stable across a mode change.
 */
function upcomingFrame(schedule: Schedule, options: FrameOptions): DotaFrame {
  const next = schedule.next;
  if (!next) {
    return idleFrame(options.idleNote, options.maxRows);
  }

  const countdown =
    next.startsAtMs === null
      ? 'TBD'
      : formatCountdown(next.startsAtMs - options.nowEpochMs);

  return {
    mode: 'upcoming',
    scoreText: countdown,
    radiantTag: next.tagA,
    direTag: next.tagB,
    clockText: next.startsAtMs === null ? '' : formatStartTime(next.startsAtMs),
    seriesText: next.stageShort,
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: '',
    backHeader: `${next.teamA} | ${next.teamB}`,
    backSub: startLine(next, options),
    backRows: bracketRows(schedule, options.maxRows),
  };
}

function startLine(next: NonNullable<Schedule['next']>, options: FrameOptions): string {
  const parts: string[] = [];
  if (next.startsAtMs === null) {
    parts.push('start TBD');
  } else {
    parts.push(`${formatStartDate(next.startsAtMs)} ${formatStartTime(next.startsAtMs)}`);
  }
  if (next.stage) {
    parts.push(next.stage);
  }
  if (next.bestOf > 0) {
    parts.push(`BO${next.bestOf}`);
  }
  void options;
  return parts.join('  ');
}

function bracketRows(schedule: Schedule, maxRows: number): BackRow[] {
  const rows: BackRow[] = [];
  // Centre the view on the upcoming match: with more rounds than rows, the ones
  // already played are the least useful thing to keep on screen.
  const nextIndex = schedule.bracket.findIndex((row) => row.next);
  const start =
    nextIndex < 0
      ? 0
      : Math.max(0, Math.min(schedule.bracket.length - maxRows, nextIndex - 1));

  for (let index = 0; index < maxRows; index += 1) {
    const row = schedule.bracket[start + index];
    rows.push(
      row
        ? { kind: 'wide', label: row.label, text: row.text, highlight: row.next }
        : emptyRow,
    );
  }
  return rows;
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
      kind: 'pair',
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
      kind: 'pair',
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
    mode: 'idle',
    scoreText: 'DOTA',
    radiantTag: '',
    direTag: '',
    clockText: '',
    seriesText: '',
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: '',
    backHeader: 'No live match',
    backSub: note,
    backRows: Array.from({ length: maxRows }, () => emptyRow),
  };
}
