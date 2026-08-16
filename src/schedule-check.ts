#!/usr/bin/env node
/**
 * Reads the schedule file and prints it as a table.
 *
 * Exists because the failure mode of a hand-written schedule is a time that is
 * off by a timezone — which looks completely fine in the file and only shows up
 * hours later as a countdown to the wrong thing. Printing tournament time and
 * your local time side by side makes that obvious in one glance.
 *
 *   npm run schedule:check
 */
import { readFile } from 'node:fs/promises';
import { loadConfig, loadEnvFile } from './config.js';
import { buildSchedule, parseScheduleFile } from './dota/schedule/json.js';
import { zoneOffsetMs } from './dota/schedule/zoned.js';
import { formatCountdown } from './view/format.js';

loadEnvFile();
const { config } = loadConfig();
const path = config.scheduleFile;

let raw: string;
try {
  raw = await readFile(path, 'utf8');
} catch {
  console.error(`${path} not found. Start one with:`);
  console.error('  cp schedule.example.json schedule.json');
  process.exit(1);
}

let parsed;
try {
  parsed = parseScheduleFile(raw);
} catch (error) {
  console.error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const zone = /"timezone"\s*:\s*"([^"]+)"/.exec(raw)?.[1] ?? 'UTC';
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const now = Date.now();
const schedule = buildSchedule(parsed, now);

// Showing the same zone twice is noise, and it is the normal case once the file
// is written in whatever zone your schedule source displays.
const sameZone = zonesMatch(zone, localZone);

console.log(`${path} — ${parsed.entries.length} matches, times in ${zone}`);
console.log(
  sameZone
    ? 'that is your local zone, so there is nothing to convert\n'
    : `your local zone is ${localZone}\n`,
);
console.log(
  pad('', 2) +
    pad(zone, 22) +
    (sameZone ? '' : pad(localZone, 22)) +
    pad('in', 10) +
    pad('stage', 8) +
    'match',
);

for (const entry of parsed.entries) {
  const startsAtMs = entry.match.startsAtMs;
  const isNext =
    schedule.next !== null &&
    schedule.next.teamA === entry.match.teamA &&
    schedule.next.teamB === entry.match.teamB &&
    schedule.next.startsAtMs === startsAtMs;

  const countdown = entry.finished
    ? `(${entry.score})`
    : startsAtMs === null
      ? 'TBD'
      : formatCountdown(startsAtMs - now);

  console.log(
    pad(isNext ? '>' : ' ', 2) +
      pad(startsAtMs === null ? 'TBD' : inZone(startsAtMs, zone), 22) +
      (sameZone
        ? ''
        : pad(startsAtMs === null ? 'TBD' : inZone(startsAtMs, localZone), 22)) +
      pad(countdown, 10) +
      pad(entry.match.stageShort || '-', 8) +
      `${entry.match.teamA} vs ${entry.match.teamB}` +
      (entry.match.bestOf ? `  BO${entry.match.bestOf}` : ''),
  );
}

console.log(
  `\nnext on the bar: ${
    schedule.next
      ? `${schedule.next.teamA} vs ${schedule.next.teamB}` +
        (schedule.next.startsAtMs === null
          ? ' (TBD)'
          : ` in ${formatCountdown(schedule.next.startsAtMs - now)}`)
      : 'nothing — every match is finished or long past'
  }`,
);
console.log(`bracket rows: ${schedule.bracket.length}${parsed.bracket ? '' : ' (derived)'}`);

function inZone(atMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(atMs));
}

function pad(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text.padEnd(width);
}

/**
 * `+04:00` and `Asia/Tbilisi` name the same thing here, so compare by what they
 * resolve to right now rather than by string.
 */
function zonesMatch(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  try {
    return zoneOffsetMs(Date.now(), a) === zoneOffsetMs(Date.now(), b);
  } catch {
    return false;
  }
}
