import { readFile, stat } from 'node:fs/promises';
import { deriveTag } from '../types';
import type { BracketRow, Schedule, ScheduleSource, UpcomingMatch } from './types';
import { isKnownTimeZone, zonedToEpochMs } from './zoned';

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

  score: string;
  finished: boolean;
};

export type ParsedSchedule = {
  entries: ScheduleEntry[];

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

    return this.cache ? buildSchedule(this.cache, this.now()) : null;
  }

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
  const upcoming = pickUpcoming(parsed.entries, nowMs);
  const next = upcoming[0] ?? null;
  const bracket = parsed.bracket ?? deriveBracket(parsed.entries);

  return { next, upcoming, bracket: markNext(bracket, next) };
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

function normaliseScore(raw: unknown, where: string) {
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

function deriveBracket(entries: ScheduleEntry[]): BracketRow[] {
  return entries.map((entry) => ({
    label: entry.match.stageShort || entry.match.stage,
    text: entry.finished
      ? `${entry.match.teamA} ${entry.score} ${entry.match.teamB}`
      : `${entry.match.teamA} vs ${entry.match.teamB}`,
    next: false,
  }));
}

function pickUpcoming(entries: ScheduleEntry[], nowMs: number): UpcomingMatch[] {
  const pending = entries.filter((entry) => !entry.finished);
  const timed = pending
    .filter((entry) => entry.match.startsAtMs !== null)
    .filter((entry) => (entry.match.startsAtMs ?? 0) + LATE_GRACE_MS > nowMs)
    .sort((a, b) => (a.match.startsAtMs ?? 0) - (b.match.startsAtMs ?? 0))
    .map((entry) => entry.match);
  const tbd = pending
    .filter((entry) => entry.match.startsAtMs === null)
    .map((entry) => entry.match);
  return [...timed, ...tbd];
}

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

function mentions(text: string, team: string) {
  if (text.includes(team)) {
    return true;
  }

  return team.split(/\s+/).some((word) => word.length >= 4 && text.includes(word));
}

export function shortenStage(stage: string) {
  if (!stage) {
    return '';
  }
  const digits = /\d+/.exec(stage)?.[0] ?? '';
  const initials = stage
    .split(/\s+/)
    // Words carrying the round number are dropped, or `Upper Bracket R2` becomes `UBR2`.
    .filter((word) => /^[A-Za-z]/.test(word) && !/\d/.test(word))
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return `${initials}${digits}`.slice(0, 6);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numOr(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}
