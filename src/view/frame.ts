import { BACK, FONT_WIDTH, FRONT, radiantFillWidth } from '../bar/layout';
import {
  fittingChars,
  tickerLine as renderTickerLine,
  type TickerStyle,
} from './ticker-text';
import type { MatchEvent, MatchEventKind } from '../domain/events';
import type { HeroCatalog } from '../dota/heroes';
import { shortLeagueName } from '../dota/leagues';
import {
  isSeriesOver,
  isShowingResult,
  resultText,
  type SeriesBreak,
} from '../domain/series';
import type { Schedule, UpcomingMatch } from '../dota/schedule/index';
import { isDrafting, type MatchSnapshot, type TeamState } from '../dota/types';
import { COLORS } from './colors';
import {
  formatClock,
  formatCountdown,
  formatGold,
  formatKda,
  formatStartDate,
  formatStartTime,
} from './format';

export type BackCell = { hero: string; stats: string };

export type BackRow =
  | { kind: 'pair'; left: BackCell | null; right: BackCell | null }
  | { kind: 'wide'; label: string; text: string; highlight: boolean };

export type FrameMode =
  'live' | 'draft' | 'result' | 'series-break' | 'upcoming' | 'idle';

export type DotaFrame = {
  mode: FrameMode;
  scoreText: string;
  radiantTag: string;
  direTag: string;
  clockText: string;
  seriesText: string;
  radiantFill: number;
  showBands: boolean;
  showDivider: boolean;
  ledColor: string;
  leadText: string;
  leadSide: 'radiant' | 'dire' | null;
  tickerText: string;
  roshanText: string;
  finalTags: { radiant: string; dire: string; winner: 'radiant' | 'dire' | null } | null;
  backHeader: string;
  backSub: string;
  backRows: BackRow[];
  banGrid: { radiant: number[]; dire: number[] } | null;
};

export type FrameOptions = {
  heroes: HeroCatalog;
  maxRows: number;
  ticker: { event: MatchEvent; elapsedMs: number } | null;
  nowEpochMs: number;
  schedule: Schedule | null;
  seriesBreak: SeriesBreak | null;
  idleNote: string;
  tickerStyle: TickerStyle;
  tickerChars: number;
  leagueName: string;
  // Hero ids whose ban portrait is already on the device; empty means text bans.
  portraits: ReadonlySet<number>;
};

const LED_BY_KIND: Partial<Record<MatchEventKind, string>> = {
  roshan: COLORS.ledRoshan,
  barracks: COLORS.ledBarracks,
  'match-start': COLORS.ledStart,
  'match-end': COLORS.ledStart,
};

function ledFor(event: MatchEvent | null) {
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

export const ROSTER_ROTATE_MS = 3000;

const emptyRow: BackRow = { kind: 'pair', left: null, right: null };

export const FRONT_LINE_CHARS = fittingChars(FRONT.width - 2, FONT_WIDTH.tiny);

export const BOLD_LINE_CHARS = fittingChars(FRONT.width, FONT_WIDTH.bold);

function eventLine(options: FrameOptions) {
  if (!options.ticker) {
    return '';
  }

  return renderTickerLine(
    options.tickerStyle,
    options.ticker.event.text,
    options.tickerChars,
    options.ticker.elapsedMs,
  );
}

export function buildFrame(snapshot: MatchSnapshot, options: FrameOptions): DotaFrame {
  if (!snapshot.live) {
    if (options.seriesBreak && isShowingResult(options.seriesBreak, options.nowEpochMs)) {
      return resultFrame(options.seriesBreak, options);
    }

    if (options.seriesBreak && !isSeriesOver(options.seriesBreak)) {
      return seriesBreakFrame(options.seriesBreak, options);
    }

    return options.schedule?.next
      ? upcomingFrame(options.schedule, options)
      : idleFrame(options.idleNote, options);
  }

  const lead = snapshot.netWorthLead;
  const leadText = lead === 0 ? 'even' : `${lead > 0 ? '+' : '-'}${formatGold(lead)}`;
  const leader = lead > 0 ? snapshot.radiant.tag : snapshot.dire.tag;
  const drafting = isDrafting(snapshot);
  const roshan = drafting ? '' : roshanText(snapshot.roshanRespawnSec);
  const bans = banGrid(snapshot, options);

  return {
    mode: drafting ? 'draft' : 'live',
    scoreText: `${snapshot.radiant.kills}-${snapshot.dire.kills}`,
    radiantTag: snapshot.radiant.tag,
    direTag: snapshot.dire.tag,
    clockText: drafting ? 'DRAFT' : formatClock(snapshot.gameTimeSec),
    seriesText: seriesText(snapshot),
    radiantFill: radiantFillWidth(lead),
    showBands: true,
    showDivider: bans === null,
    ledColor: ledFor(options.ticker?.event ?? null),
    ...leadFields(lead),
    tickerText: eventLine(options),
    roshanText: roshan,
    finalTags: null,
    backHeader: `${snapshot.radiant.name} | ${snapshot.dire.name}`,
    backSub:
      options.ticker?.event.text ||
      (drafting
        ? banSummary(snapshot, options)
        : [lead === 0 ? 'even' : `${leader} ${leadText}`, towerText(snapshot), roshan]
            .filter(Boolean)
            .join('  ')),
    backRows: bans
      ? Array.from({ length: options.maxRows }, () => emptyRow)
      : drafting
        ? draftRows(snapshot, options)
        : backRows(snapshot, options),
    banGrid: bans,
  };
}

const ROSHAN_LABEL = 'R';

// Five glyphs at most: the bottom row also holds the clock and the gold lead, and
// nobody needs seconds while Roshan is still ten minutes out.
function roshanText(respawnSec: number | null) {
  if (respawnSec === null || respawnSec <= 0) {
    return '';
  }

  if (respawnSec >= 600) {
    return `${ROSHAN_LABEL}${Math.round(respawnSec / 60)}m`;
  }

  return `${ROSHAN_LABEL}${formatClock(respawnSec)}`;
}

// Portraits replace the pick list only once both drafts are full: before that the
// names are the thing being watched, and after it the bans are all that is left.
function banGrid(snapshot: MatchSnapshot, options: FrameOptions) {
  if (!isDrafting(snapshot)) {
    return null;
  }
  const { radiant, dire } = snapshot;
  if (radiant.draft.picks.length < DRAFT_SLOTS || dire.draft.picks.length < DRAFT_SLOTS) {
    return null;
  }

  const bans = [...radiant.draft.bans, ...dire.draft.bans];
  if (bans.length === 0 || !bans.every((heroId) => options.portraits.has(heroId))) {
    return null;
  }

  return { radiant: [...radiant.draft.bans], dire: [...dire.draft.bans] };
}

export function matchupLine(
  teams: { aName: string; bName: string; aTag: string; bTag: string },
  middle: string,
  maxChars: number,
) {
  const full = `${teams.aName} ${middle} ${teams.bName}`;
  if (full.length <= maxChars) {
    return full;
  }

  return `${teams.aTag} ${middle} ${teams.bTag}`;
}

function resultFrame(current: SeriesBreak, options: FrameOptions): DotaFrame {
  const series = `${current.radiantWins}-${current.direWins}`;
  const scheduled = options.schedule?.next ?? null;

  return {
    mode: 'result',
    scoreText: '',
    radiantTag: '',
    direTag: '',
    clockText: '',
    seriesText: series,
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: COLORS.ledStart,
    leadText: '',
    leadSide: null,
    tickerText: scheduled ? `next ${scheduled.tagA} vs ${scheduled.tagB}` : '',
    roshanText: '',
    finalTags: {
      radiant: current.radiantTag,
      dire: current.direTag,
      winner: current.lastWinner,
    },
    backHeader: `${current.radiantName} | ${current.direName}`,
    backSub: `${resultText(current)}. Series ${series}`,
    backRows: scheduleRows(options),
    banGrid: null,
  };
}

const LEAD_FLOOR = 500;

function leadFields(lead: number): Pick<DotaFrame, 'leadText' | 'leadSide'> {
  if (Math.abs(lead) < LEAD_FLOOR) {
    return { leadText: '', leadSide: null };
  }

  return {
    leadText: `+${formatGold(lead)}`,
    leadSide: lead > 0 ? 'radiant' : 'dire',
  };
}

function seriesBreakFrame(current: SeriesBreak, options: FrameOptions): DotaFrame {
  const scheduled = options.schedule?.next ?? null;
  const series = `${current.radiantWins}-${current.direWins}`;

  return {
    mode: 'series-break',
    scoreText: countdownTo(scheduled, options.nowEpochMs),
    radiantTag: '',
    direTag: '',
    clockText: '',
    seriesText: '',
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: '',
    leadText: '',
    leadSide: null,
    finalTags: null,
    roshanText: '',
    tickerText: matchupLine(
      {
        aName: current.radiantName,
        bName: current.direName,
        aTag: current.radiantTag,
        bTag: current.direTag,
      },
      series,
      options.tickerChars,
    ),
    backHeader: `${current.radiantName} | ${current.direName}`,
    backSub: `series ${series}  game ${current.nextGame} next  ${scheduledNote(scheduled)}`,
    backRows: scheduleRows(options),
    banGrid: null,
  };
}

function countdownTo(next: Schedule['next'], nowEpochMs: number) {
  if (!next) {
    return 'BREAK';
  }

  return next.startsAtMs === null ? 'TBD' : formatCountdown(next.startsAtMs - nowEpochMs);
}

function scheduledNote(next: Schedule['next']) {
  if (!next?.startsAtMs) {
    return '';
  }

  return `next ${formatStartTime(next.startsAtMs)}`;
}

function upcomingFrame(schedule: Schedule, options: FrameOptions): DotaFrame {
  const next = schedule.next;
  if (!next) {
    return idleFrame(options.idleNote, options);
  }

  return {
    mode: 'upcoming',
    scoreText: countdownTo(next, options.nowEpochMs),
    radiantTag: '',
    direTag: '',
    clockText: '',
    seriesText: '',
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: '',
    leadText: '',
    leadSide: null,
    finalTags: null,
    roshanText: '',
    tickerText: matchupLine(
      { aName: next.teamA, bName: next.teamB, aTag: next.tagA, bTag: next.tagB },
      'VS',
      options.tickerChars,
    ),
    backHeader: `${next.teamA} | ${next.teamB}`,
    backSub: startLine(next, options),
    backRows: scheduleRows(options),
    banGrid: null,
  };
}

function startLine(next: NonNullable<Schedule['next']>, options: FrameOptions) {
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

function scheduleRows(options: FrameOptions): BackRow[] {
  const rows: BackRow[] = [];
  const upcoming = options.schedule?.upcoming ?? [];
  const nextDate = options.schedule?.next?.startsAtMs
    ? formatStartDate(options.schedule.next.startsAtMs)
    : '';
  const textChars = fittingChars(BACK.bracketTextWidth, FONT_WIDTH.tiny);

  for (let index = 0; index < options.maxRows; index += 1) {
    const match = upcoming[index];
    if (!match) {
      rows.push(emptyRow);
      continue;
    }
    rows.push(upcomingRow(match, nextDate, textChars, index === 0));
  }
  return rows;
}

function upcomingRow(
  match: UpcomingMatch,
  nextDate: string,
  textChars: number,
  highlight: boolean,
): BackRow {
  const time = match.startsAtMs === null ? 'TBD' : formatStartTime(match.startsAtMs);
  const date = match.startsAtMs === null ? '' : formatStartDate(match.startsAtMs);
  const dated = date && date !== nextDate ? `${date} ` : '';
  const matchup = matchupLine(
    { aName: match.teamA, bName: match.teamB, aTag: match.tagA, bTag: match.tagB },
    'vs',
    Math.max(1, textChars - dated.length),
  );
  return {
    kind: 'wide',
    label: time,
    text: `${dated}${matchup}`,
    highlight,
  };
}

function banSummary(snapshot: MatchSnapshot, options: FrameOptions) {
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

export const DRAFT_SLOTS = 5;

const EMPTY_SLOT = '-';

function draftRows(snapshot: MatchSnapshot, options: FrameOptions): BackRow[] {
  const rows: BackRow[] = [];
  for (let index = 0; index < options.maxRows; index += 1) {
    const slot = index < DRAFT_SLOTS;
    rows.push({
      kind: 'pair',
      left: slot ? pickCell(snapshot.radiant, index, options) : null,
      right: slot ? pickCell(snapshot.dire, index, options) : null,
    });
  }

  return rows;
}

function pickCell(team: TeamState, index: number, options: FrameOptions): BackCell {
  const heroId = team.draft.picks[index];

  return {
    hero: heroId === undefined ? EMPTY_SLOT : options.heroes.name(heroId),
    stats: `#${index + 1}`,
  };
}

function seriesText(snapshot: MatchSnapshot) {
  const wins = snapshot.radiant.seriesWins + snapshot.dire.seriesWins;
  if (snapshot.seriesType === 0 && wins === 0) {
    return '';
  }

  return `${snapshot.radiant.seriesWins}-${snapshot.dire.seriesWins}`;
}

function towerText(snapshot: MatchSnapshot) {
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
  const gold = player.netWorth === null ? '' : formatGold(player.netWorth);
  const flipped = Math.floor(options.nowEpochMs / ROSTER_ROTATE_MS) % 2 === 1;

  return {
    hero:
      flipped && player.name !== '' ? player.name : options.heroes.name(player.heroId),
    stats: (flipped ? gold || kda : kda || gold) || '',
  };
}

export const IDLE_TITLE = 'DOTA';

function idleFrame(note: string, options: FrameOptions): DotaFrame {
  const league = options.leagueName;

  return {
    mode: 'idle',
    scoreText: shortLeagueName(league, BOLD_LINE_CHARS) || IDLE_TITLE,
    radiantTag: '',
    direTag: '',
    clockText: '',
    seriesText: '',
    radiantFill: radiantFillWidth(0),
    showBands: false,
    showDivider: false,
    ledColor: '',
    leadText: '',
    leadSide: null,
    finalTags: null,
    // The bottom row takes the full name only when it fits whole: the big row
    // already carries the short form, and a name split across pages reads badly.
    tickerText: league.length <= options.tickerChars ? league : '',
    roshanText: '',
    backHeader: league || 'No live match',
    backSub: note,
    backRows: Array.from({ length: options.maxRows }, () => emptyRow),
    banGrid: null,
  };
}
