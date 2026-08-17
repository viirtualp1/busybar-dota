import { BACK, FONT_WIDTH, FRONT, radiantFillWidth } from '../bar/layout';
import {
  fittingChars,
  tickerLine as renderTickerLine,
  type TickerStyle,
} from './ticker-text';
import type { MatchEvent, MatchEventKind } from '../domain/events';
import type { HeroCatalog } from '../dota/heroes';
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
  finalTags: { radiant: string; dire: string; winner: 'radiant' | 'dire' | null } | null;
  backHeader: string;
  backSub: string;
  backRows: BackRow[];
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
    clockText: drafting ? 'DRAFT' : formatClock(snapshot.gameTimeSec),
    seriesText: seriesText(snapshot),
    radiantFill: radiantFillWidth(lead),
    showBands: true,
    showDivider: true,
    ledColor: ledFor(options.ticker?.event ?? null),
    ...leadFields(lead),
    tickerText: eventLine(options),
    finalTags: null,
    backHeader: `${snapshot.radiant.name} | ${snapshot.dire.name}`,
    backSub:
      options.ticker?.event.text ||
      (drafting
        ? banSummary(snapshot, options)
        : lead === 0
          ? `even  ${towerText(snapshot)}`
          : `${leader} ${leadText}  ${towerText(snapshot)}`),
    backRows: drafting ? draftRows(snapshot, options) : backRows(snapshot, options),
  };
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
    finalTags: {
      radiant: current.radiantTag,
      dire: current.direTag,
      winner: current.lastWinner,
    },
    backHeader: `${current.radiantName} | ${current.direName}`,
    backSub: `${resultText(current)}. Series ${series}`,
    backRows: scheduleRows(options),
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
    return idleFrame(options.idleNote, options.maxRows);
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
    tickerText: matchupLine(
      { aName: next.teamA, bName: next.teamB, aTag: next.tagA, bTag: next.tagB },
      'VS',
      options.tickerChars,
    ),
    backHeader: `${next.teamA} | ${next.teamB}`,
    backSub: startLine(next, options),
    backRows: scheduleRows(options),
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

  return { hero: options.heroes.name(heroId), stats: `#${index + 1}` };
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

  const stats = kda || (player.netWorth !== null ? formatGold(player.netWorth) : '');
  const showPlayer =
    player.name !== '' && Math.floor(options.nowEpochMs / ROSTER_ROTATE_MS) % 2 === 1;
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
    leadText: '',
    leadSide: null,
    finalTags: null,
    tickerText: '',
    backHeader: 'No live match',
    backSub: note,
    backRows: Array.from({ length: maxRows }, () => emptyRow),
  };
}
