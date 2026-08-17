import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSchedule,
  parseScheduleFile,
  ScheduleFileError,
} from '../src/dota/schedule/json';
import { isKnownTimeZone, zonedToEpochMs } from '../src/dota/schedule/zoned';

const DAY = JSON.stringify({
  timezone: 'Asia/Shanghai',
  date: '2026-08-16',
  matches: [
    {
      teams: 'Team Spirit vs Tundra',
      time: '10:00',
      stage: 'Upper Bracket R1',
      score: '2-0',
    },
    { teams: 'Team Spirit vs Falcons', time: '21:30', stage: 'Upper Bracket R2', bo: 3 },
    { teams: 'Tundra vs Liquid', time: '23:30', stage: 'Lower Bracket R2', bo: 3 },
  ],
});

const BEFORE = Date.parse('2026-08-16T20:00:00+08:00');

test('a wall-clock time in a zone lands on the right instant', () => {
  assert.equal(
    zonedToEpochMs('2026-08-16', '10:00', 'Asia/Shanghai'),
    Date.parse('2026-08-16T10:00:00+08:00'),
  );

  assert.equal(
    zonedToEpochMs('2026-01-15', '12:00', 'Europe/Berlin'),
    Date.parse('2026-01-15T12:00:00+01:00'),
  );
  assert.equal(
    zonedToEpochMs('2026-07-15', '12:00', 'Europe/Berlin'),
    Date.parse('2026-07-15T12:00:00+02:00'),
  );
});

test('a fixed offset works too, for people who prefer it', () => {
  assert.equal(
    zonedToEpochMs('2026-08-16', '10:00', '+08:00'),
    Date.parse('2026-08-16T10:00:00+08:00'),
  );
});

test('unreadable times are rejected rather than guessed at', () => {
  assert.equal(zonedToEpochMs('2026-08-16', 'lunchtime', 'UTC'), null);
  assert.equal(zonedToEpochMs('16/08/2026', '10:00', 'UTC'), null);
  assert.equal(zonedToEpochMs('2026-08-16', '25:00', 'UTC'), null);
});

test('a bogus timezone is caught at load, not at midnight', () => {
  assert.equal(isKnownTimeZone('Asia/Shanghai'), true);
  assert.equal(isKnownTimeZone('+08:00'), true);
  assert.equal(isKnownTimeZone('Asia/Shanghia'), false);
  assert.throws(
    () => parseScheduleFile('{"timezone":"Asia/Shanghia","matches":[]}'),
    /not a zone I know/,
  );
});

test('the file date and timezone apply to every match', () => {
  const parsed = parseScheduleFile(DAY);
  assert.equal(
    parsed.entries[1]?.match.startsAtMs,
    Date.parse('2026-08-16T21:30:00+08:00'),
  );
});

test('"A vs B" splits into two teams with derived tags', () => {
  const parsed = parseScheduleFile(DAY);
  const match = parsed.entries[1]?.match;
  assert.equal(match?.teamA, 'Team Spirit');
  assert.equal(match?.teamB, 'Falcons');
  assert.equal(match?.tagA, 'TS');
  assert.equal(match?.tagB, 'FAL');
});

test('a match with a score drops out of the countdown', () => {
  const schedule = buildSchedule(parseScheduleFile(DAY), BEFORE);

  assert.equal(schedule.next?.teamB, 'Falcons');
  assert.equal(schedule.upcoming.length, 2);
  assert.equal(schedule.upcoming[0]?.teamB, 'Falcons');
  assert.equal(schedule.upcoming[1]?.teamB, 'Liquid');
});

test('the bracket is derived from the matches, with results filled in', () => {
  const schedule = buildSchedule(parseScheduleFile(DAY), BEFORE);
  assert.equal(schedule.bracket.length, 3);
  assert.equal(schedule.bracket[0]?.text, 'Team Spirit 2-0 Tundra');
  assert.equal(schedule.bracket[0]?.label, 'UB1');
  assert.equal(schedule.bracket[1]?.text, 'Team Spirit vs Falcons');
  assert.equal(schedule.bracket[1]?.next, true);
});

test('an explicit bracket still overrides the derived one', () => {
  const raw = JSON.stringify({
    timezone: 'UTC',
    date: '2026-08-16',
    matches: [{ teams: 'A vs B', time: '10:00' }],
    bracket: [{ label: 'X', text: 'hand written' }],
  });
  const schedule = buildSchedule(
    parseScheduleFile(raw),
    Date.parse('2026-08-16T09:00:00Z'),
  );
  assert.equal(schedule.bracket.length, 1);
  assert.equal(schedule.bracket[0]?.text, 'hand written');
});

test('scores are normalised, and nonsense is refused', () => {
  const raw = JSON.stringify({
    timezone: 'UTC',
    date: '2026-08-16',
    matches: [{ teams: 'A vs B', time: '10:00', score: '2 : 1' }],
  });
  const schedule = buildSchedule(parseScheduleFile(raw), 0);
  assert.equal(schedule.bracket[0]?.text, 'A 2-1 B');
  assert.throws(
    () =>
      parseScheduleFile(JSON.stringify({ matches: [{ teams: 'A vs B', score: 'won' }] })),
    /score should look like/,
  );
});

test('a time with no date anywhere says so instead of guessing today', () => {
  assert.throws(
    () =>
      parseScheduleFile(
        JSON.stringify({ matches: [{ teams: 'A vs B', time: '10:00' }] }),
      ),
    /needs a date/,
  );
});

test('a malformed teams string names the field', () => {
  assert.throws(
    () => parseScheduleFile(JSON.stringify({ matches: [{ teams: 'A and B' }] })),
    /matches\[0\]\.teams/,
  );
});

test('the longhand form keeps working', () => {
  const raw = JSON.stringify({
    matches: [
      { teamA: 'A', teamB: 'B', startsAt: '2026-08-16T10:00:00+08:00', bestOf: 5 },
    ],
  });
  const parsed = parseScheduleFile(raw);
  assert.equal(
    parsed.entries[0]?.match.startsAtMs,
    Date.parse('2026-08-16T10:00:00+08:00'),
  );
  assert.equal(parsed.entries[0]?.match.bestOf, 5);
});

test('a per-match date overrides the file default', () => {
  const raw = JSON.stringify({
    timezone: 'Asia/Shanghai',
    date: '2026-08-16',
    matches: [{ teams: 'A vs B', time: '02:00', date: '2026-08-17' }],
  });
  const parsed = parseScheduleFile(raw);
  assert.equal(
    parsed.entries[0]?.match.startsAtMs,
    Date.parse('2026-08-17T02:00:00+08:00'),
  );
});

test('a bad file date is refused up front', () => {
  assert.throws(
    () => parseScheduleFile('{"date":"16-08-2026","matches":[]}'),
    ScheduleFileError,
  );
});
