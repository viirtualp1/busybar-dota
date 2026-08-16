/**
 * A hand-maintained schedule file.
 *
 * The working default, because no free API publishes a pro schedule right now:
 * Liquipedia moved brackets off their basic tier and STRATZ's token signup is
 * broken. So the format is optimised for typing it in fast at 2am:
 *
 *   - `timezone` and `date` are set once for the file, so each match is `10:00`
 *     and you never convert a tournament time into your own.
 *   - `teams` is one field, `"Spirit vs Falcons"`, not two.
 *   - `bracket` is derived from the matches unless you override it, so a day's
 *     schedule is one list rather than two that must agree.
 *   - Adding `"score": "2-0"` marks a match played: it drops out of the
 *     countdown and shows its result in the bracket. One edit per finished game.
 *
 * The file is re-read whenever it changes, so it can be edited while the app
 * runs — which is the whole point of maintaining it by hand.
 */
import { readFile, stat } from 'node:fs/promises';
import { deriveTag } from '../types.js';
import type { BracketRow, Schedule, ScheduleSource, UpcomingMatch } from './types.js';
import { isKnownTimeZone, zonedToEpochMs } from './zoned.js';

/**
 * How long after its scheduled start a match stays "next".
 *
 * Broadcasts run late constantly. Dropping a match the instant its clock passes
 * would blank the display exactly when the game is about to start.
 */
const LATE_GRACE_MS = 30 * 60 * 1000;

const DEFAULT_TIMEZONE = 'UTC';

export class ScheduleFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleFileError';
  }
}

export type ScheduleEntry = {
  match: UpcomingMatch;
  /** `2-0` once played, empty while pending. */
  score: string;
  finished: boolean;
};

/** The file's contents, before "which match is next" is decided. */
export type ParsedSchedule = {
  entries: ScheduleEntry[];
  /** `null` means "derive it from the matches". */
  bracket: BracketRow[] | null;
};

export class JsonScheduleSource implements ScheduleSource {
  readonly label: string;
  private cache: ParsedSchedule | null = null;
  private cachedAtMs = 0;
  private cachedSize = -1;

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
  ) {
    this.label = `json (${path})`;
  }

  async poll(): Promise<Schedule | null> {
    if (!(await this.reloadIfChanged())) {
      return null;
    }
    // Built fresh every poll rather than cached with the file: the same file
    // means something different once a match's start time passes.
    return this.cache ? buildSchedule(this.cache, this.now()) : null;
  }

  /** False when the file is absent — a missing schedule is not an error. */
  private async reloadIfChanged(): Promise<boolean> {
    let stats;
    try {
      stats = await stat(this.path);
    } catch {
      this.cache = null;
      return false;
    }

    if (
      this.cache &&
      stats.mtimeMs === this.cachedAtMs &&
      stats.size === this.cachedSize
    ) {
      return true;
    }

    const raw = await readFile(this.path, 'utf8');
    this.cache = parseScheduleFile(raw);
    this.cachedAtMs = stats.mtimeMs;
    this.cachedSize = stats.size;
    return true;
  }
}

/** Throws `ScheduleFileError` on bad input, with the path to the offending field. */
export function parseScheduleFile(raw: string): ParsedSchedule {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    throw new ScheduleFileError(
      `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(body)) {
    throw new ScheduleFileError('expected an object at the top level');
  }

  const timeZone = str(body['timezone']) || DEFAULT_TIMEZONE;
  if (!isKnownTimeZone(timeZone)) {
    throw new ScheduleFileError(
      `timezone "${timeZone}" is not a zone I know — use an IANA name like ` +
        'Asia/Shanghai, or a fixed offset like +08:00',
    );
  }
  const defaultDate = str(body['date']);
  if (defaultDate && !/^\d{4}-\d{2}-\d{2}$/.test(defaultDate)) {
    throw new ScheduleFileError(`date "${defaultDate}" must look like 2026-08-16`);
  }

  const entries = readMatches(body['matches'], { timeZone, defaultDate });
  const bracket = body['bracket'] === undefined ? null : readBracket(body['bracket']);
  return { entries, bracket };
}

export function buildSchedule(parsed: ParsedSchedule, nowMs: number): Schedule {
  const next = pickNext(parsed.entries, nowMs);
  const bracket = parsed.bracket ?? deriveBracket(parsed.entries);
  return { next, bracket: markNext(bracket, next) };
}

type Defaults = { timeZone: string; defaultDate: string };

function readMatches(raw: unknown, defaults: Defaults): ScheduleEntry[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new ScheduleFileError('`matches` must be an array');
  }
  return raw.map((entry, index) => readMatch(entry, index, defaults));
}

function readMatch(raw: unknown, index: number, defaults: Defaults): ScheduleEntry {
  const where = `matches[${index}]`;
  if (!isRecord(raw)) {
    throw new ScheduleFileError(`${where} must be an object`);
  }

  const [teamA, teamB] = readTeams(raw, where);
  const stage = str(raw['stage']);
  const score = normaliseScore(raw['score'], where);

  return {
    score,
    finished: score !== '',
    match: {
      teamA,
      teamB,
      tagA: str(raw['tagA']) || deriveTag(teamA, 'A'),
      tagB: str(raw['tagB']) || deriveTag(teamB, 'B'),
      startsAtMs: readStart(raw, where, defaults),
      stage,
      stageShort: str(raw['stageShort']) || shortenStage(stage),
      bestOf: numOr(raw['bo'] ?? raw['bestOf'], 0),
    },
  };
}

/** Accepts `"Spirit vs Falcons"` or the longhand `teamA` / `teamB` pair. */
function readTeams(raw: Record<string, unknown>, where: string): [string, string] {
  const combined = str(raw['teams']);
  if (combined) {
    const parts = combined.split(/\s+(?:vs\.?|v|—|-)\s+/i);
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new ScheduleFileError(
        `${where}.teams should read "Team A vs Team B", got "${combined}"`,
      );
    }
    return [parts[0].trim(), parts[1].trim()];
  }

  const teamA = str(raw['teamA']);
  const teamB = str(raw['teamB']);
  if (!teamA || !teamB) {
    throw new ScheduleFileError(`${where} needs "teams", or both teamA and teamB`);
  }
  return [teamA, teamB];
}

/**
 * `time` plus the file's date and zone is the fast path; `startsAt` with a full
 * ISO string still works for one-off matches on another day.
 */
function readStart(
  raw: Record<string, unknown>,
  where: string,
  defaults: Defaults,
): number | null {
  const time = str(raw['time']);
  if (time) {
    const date = str(raw['date']) || defaults.defaultDate;
    if (!date) {
      throw new ScheduleFileError(
        `${where}.time needs a date — set "date" at the top of the file, ` +
          `or "date" on this match`,
      );
    }
    const parsed = zonedToEpochMs(date, time, defaults.timeZone);
    if (parsed === null) {
      throw new ScheduleFileError(
        `${where}.time "${time}" is not a time I can read (expected HH:MM)`,
      );
    }
    return parsed;
  }

  const startsAt = raw['startsAt'];
  if (startsAt === undefined || startsAt === null || startsAt === '') {
    return null;
  }
  if (typeof startsAt === 'number' && Number.isFinite(startsAt)) {
    return startsAt;
  }
  if (typeof startsAt !== 'string') {
    throw new ScheduleFileError(`${where}.startsAt must be an ISO date string`);
  }
  const parsed = Date.parse(startsAt);
  if (Number.isNaN(parsed)) {
    throw new ScheduleFileError(
      `${where}.startsAt is not a date I can read: ${startsAt} ` +
        '(use an ISO string with an offset, e.g. 2026-08-16T10:00:00+08:00)',
    );
  }
  return parsed;
}

function normaliseScore(raw: unknown, where: string): string {
  if (raw === undefined || raw === null || raw === '') {
    return '';
  }
  const score = str(raw);
  if (!/^\d+\s*[-:]\s*\d+$/.test(score)) {
    throw new ScheduleFileError(`${where}.score should look like "2-0", got "${score}"`);
  }
  return score.replace(/\s*[-:]\s*/, '-');
}

function readBracket(raw: unknown): BracketRow[] {
  if (!Array.isArray(raw)) {
    throw new ScheduleFileError('`bracket` must be an array');
  }
  return raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new ScheduleFileError(`bracket[${index}] must be an object`);
    }
    return {
      label: str(entry['label']),
      text: str(entry['text']),
      next: entry['next'] === true,
    };
  });
}

/** One list in, two views out — the bracket is just the matches, rendered. */
function deriveBracket(entries: ScheduleEntry[]): BracketRow[] {
  return entries.map((entry) => ({
    label: entry.match.stageShort || entry.match.stage,
    text: entry.finished
      ? `${entry.match.teamA} ${entry.score} ${entry.match.teamB}`
      : `${entry.match.teamA} vs ${entry.match.teamB}`,
    next: false,
  }));
}

function pickNext(entries: ScheduleEntry[], nowMs: number): UpcomingMatch | null {
  const pending = entries.filter((entry) => !entry.finished);
  const scheduled = pending
    .filter((entry) => entry.match.startsAtMs !== null)
    .sort((a, b) => (a.match.startsAtMs ?? 0) - (b.match.startsAtMs ?? 0));

  const upcoming = scheduled.find(
    (entry) => (entry.match.startsAtMs ?? 0) + LATE_GRACE_MS > nowMs,
  );
  if (upcoming) {
    return upcoming.match;
  }
  // Every timed entry is in the past: fall back to a TBD match if one was
  // listed, so "next up, time unknown" still reaches the display.
  return pending.find((entry) => entry.match.startsAtMs === null)?.match ?? null;
}

/**
 * Highlights the bracket row for the upcoming tie.
 *
 * An explicit `"next": true` always wins. Otherwise the row naming both teams is
 * used, which saves editing two places every time a match ends.
 */
function markNext(bracket: BracketRow[], next: UpcomingMatch | null): BracketRow[] {
  if (bracket.some((row) => row.next) || !next) {
    return bracket;
  }
  const a = next.teamA.toLowerCase();
  const b = next.teamB.toLowerCase();
  let marked = false;
  return bracket.map((row) => {
    if (marked) {
      return row;
    }
    const text = row.text.toLowerCase();
    if (mentions(text, a) && mentions(text, b)) {
      marked = true;
      return { ...row, next: true };
    }
    return row;
  });
}

/** Bracket text usually shortens names, so match on any word of the team name. */
function mentions(text: string, team: string): boolean {
  if (text.includes(team)) {
    return true;
  }
  return team.split(/\s+/).some((word) => word.length >= 4 && text.includes(word));
}

/** `Upper Bracket R2` → `UB2`, so the stage fits the 26px slot on the front. */
export function shortenStage(stage: string): string {
  if (!stage) {
    return '';
  }
  const digits = /\d+/.exec(stage)?.[0] ?? '';
  const initials = stage
    .split(/\s+/)
    // Words carrying the round number are dropped, or `Upper Bracket R2` picks
    // up the R and comes out as `UBR2`.
    .filter((word) => /^[A-Za-z]/.test(word) && !/\d/.test(word))
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return `${initials}${digits}`.slice(0, 6);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
