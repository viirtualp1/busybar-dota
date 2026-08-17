import { radiantFillWidth } from '../bar/layout.js';
import type { MatchEvent, MatchEventKind } from '../domain/events.js';
import type { HeroCatalog } from '../dota/heroes.js';
import type { SeriesBreak } from '../domain/series.js';
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

export type FrameMode = 'live' | 'draft' | 'series-break' | 'upcoming' | 'idle';

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
  /** When set, it takes over the front's bottom row for a few seconds. */
  tickerText: string;
  backHeader: string;
  backSub: string;
  backRows: BackRow[];
};

export type FrameOptions = {
  heroes: HeroCatalog;
  maxRows: number;
  /** The event currently owning the ticker, if any. */
  ticker: MatchEvent | null;
  /** Wall-clock time, needed for the countdown. */
  nowEpochMs: number;
  /** `null` when no schedule source is configured or it is unreachable. */
  schedule: Schedule | null;
  /** Set between games of an undecided series; outranks the schedule. */
  seriesBreak: SeriesBreak | null;
  /** Shown on the back display when there is nothing at all to show. */
  idleNote: string;
};

/**
 * Buildings and Roshan get their own colours; a kill just tints the bar in the
 * colour of whoever got it.
 */
const LED_BY_KIND: Partial<Record<MatchEventKind, string>> = {
  roshan: COLORS.ledRoshan,
  barracks: COLORS.ledBarracks,
  'match-start': COLORS.ledStart,
  'match-end': COLORS.ledStart,
};

function ledFor(event: MatchEvent | null): string {
  if (!event) {
    return '';
  }
  const byKind = LED_BY_KIND[event.kind];
  if (byKind) {
    return byKind;
  }
  if (event.side === 'radiant') {
    return COLORS.ledRadiant;
  }
  return event.side === 'dire' ? COLORS.ledDire : COLORS.ledStart;
}

/**
 * How long each of the hero name and the player name holds a roster row.
 *
 * The back display has no room for both, and knowing who is on a hero matters
 * as much as knowing the hero, so the row alternates rather than choosing.
 */
export const ROSTER_ROTATE_MS = 3000;

const emptyRow: BackRow = { kind: 'pair', left: null, right: null };

export function buildFrame(snapshot: MatchSnapshot, options: FrameOptions): DotaFrame {
  if (!snapshot.live) {
    // A series resuming in ten minutes beats a scheduled match hours away.
    if (options.seriesBreak) {
      return seriesBreakFrame(options.seriesBreak, options);
    }
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
    ledColor: ledFor(options.ticker),
    tickerText: options.ticker?.short ?? '',
    // Left name is the left column, right name is the right column — the header
    // is what makes the divider mean something.
    backHeader: `${snapshot.radiant.name} | ${snapshot.dire.name}`,
    // The ticker owns the sub-line while it runs: an event is worth more than
    // a net worth figure that is still there three seconds later.
    backSub:
      options.ticker?.long ??
      (drafting
        ? banSummary(snapshot, options)
        : lead === 0
          ? `even  ${towerText(snapshot)}`
          : `${leader} ${leadText}  ${towerText(snapshot)}`),
    backRows: drafting ? draftRows(snapshot, options) : backRows(snapshot, options),
  };
}

/**
 * Between games of a series.
 *
 * The countdown is kept in the headline slot, but it counts to the next
 * *scheduled* match — nobody publishes a start time for game 2 of a series, so
 * inventing one would be a lie. The teams and the series score come from the
 * game that just ended, and the back display says which is which.
 */
function seriesBreakFrame(current: SeriesBreak, options: FrameOptions): DotaFrame {
  const scheduled = options.schedule?.next ?? null;
  const countdown =
    scheduled?.startsAtMs !== undefined && scheduled.startsAtMs !== null
      ? formatCountdown(scheduled.startsAtMs - options.nowEpochMs)
      : 'BREAK';

  const score = `${current.radiantWins}-${current.direWins}`;
  const finishedGame = current.nextGame - 1;

  return {
    mode: 'series-break',
    scoreText: countdown,
    radiantTag: current.radiantTag,
    direTag: current.direTag,
    // A trailing marker while the winner of the finished game is still unknown,
    // so a stale score never passes for a settled one.
    clockText: current.pendingResult ? `${score}*` : score,
    seriesText: `G${current.nextGame}`,
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: '',
    tickerText: '',
    backHeader: `${current.radiantName} | ${current.direName}`,
    backSub: current.pendingResult
      ? `game ${finishedGame} done, result pending  ${scheduledNote(scheduled)}`
      : `${score}  game ${current.nextGame} next  ${scheduledNote(scheduled)}`,
    backRows: options.schedule
      ? bracketRows(options.schedule, options.maxRows)
      : Array.from({ length: options.maxRows }, () => emptyRow),
  };
}

function scheduledNote(next: Schedule['next']): string {
  if (!next?.startsAtMs) {
    return '';
  }
  return `next ${formatStartTime(next.startsAtMs)}`;
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
    // No stage here: `UB2` told nobody anything the back display was not
    // already spelling out in full.
    seriesText: '',
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: '',
    tickerText: '',
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

  // A round label repeated down every row is noise; it only earns its column
  // when the round actually changes.
  let previousLabel = start > 0 ? (schedule.bracket[start - 1]?.label ?? '') : '';
  for (let index = 0; index < maxRows; index += 1) {
    const row = schedule.bracket[start + index];
    if (!row) {
      rows.push(emptyRow);
      continue;
    }
    rows.push({
      kind: 'wide',
      label: row.label === previousLabel ? '' : row.label,
      text: row.text,
      highlight: row.next,
    });
    previousLabel = row.label;
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
  // Alternate hero and player. Sources without names (OpenDota) never flip, so
  // the row does not blink between a hero and an empty cell.
  const showPlayer =
    player.name !== '' &&
    Math.floor(options.nowEpochMs / ROSTER_ROTATE_MS) % 2 === 1;
  return {
    hero: showPlayer ? player.name : options.heroes.name(player.heroId),
    stats,
  };
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
    tickerText: '',
    backHeader: 'No live match',
    backSub: note,
    backRows: Array.from({ length: maxRows }, () => emptyRow),
  };
}
