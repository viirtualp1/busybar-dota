import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildSchedule,
  JsonScheduleSource,
  parseScheduleFile,
  ScheduleFileError,
  shortenStage,
} from '../src/dota/schedule/json.js';
import { seriesTypeToBestOf, StratzScheduleSource } from '../src/dota/schedule/stratz.js';

const AUG16_10 = Date.parse('2026-08-16T10:00:00+08:00');
const AUG16_13 = Date.parse('2026-08-16T13:00:00+08:00');

const FILE = JSON.stringify({
  matches: [
    {
      teamA: 'Tundra',
      teamB: 'Liquid',
      startsAt: '2026-08-16T13:00:00+08:00',
      stage: 'Lower Bracket R2',
      bestOf: 3,
    },
    {
      teamA: 'Team Spirit',
      teamB: 'Falcons',
      startsAt: '2026-08-16T10:00:00+08:00',
      stage: 'Upper Bracket R2',
      bestOf: 3,
    },
  ],
  bracket: [
    { label: 'UB R1', text: 'Spirit 2-0 Tundra' },
    { label: 'UB R2', text: 'Spirit vs Falcons' },
    { label: 'LB R2', text: 'Tundra vs Liquid' },
  ],
});

test('the soonest match wins, whatever order the file lists them in', () => {
  const parsed = parseScheduleFile(FILE);
  const schedule = buildSchedule(parsed, AUG16_10 - 3_600_000);
  assert.equal(schedule.next?.teamA, 'Team Spirit');
  assert.equal(schedule.next?.startsAtMs, AUG16_10);
});

test('a match that already started stays next through its grace window', () => {
  const parsed = parseScheduleFile(FILE);
  // Ten minutes late: broadcasts run late, and blanking the display then is wrong.
  const late = buildSchedule(parsed, AUG16_10 + 10 * 60_000);
  assert.equal(late.next?.teamA, 'Team Spirit');
  // An hour late: it is not coming, move on to the next one.
  const gone = buildSchedule(parsed, AUG16_10 + 60 * 60_000);
  assert.equal(gone.next?.teamA, 'Tundra');
});

test('once every match is past, there is nothing next', () => {
  const parsed = parseScheduleFile(FILE);
  assert.equal(buildSchedule(parsed, AUG16_13 + 86_400_000).next, null);
});

test('tags and short stages are derived when the file omits them', () => {
  const parsed = parseScheduleFile(FILE);
  const schedule = buildSchedule(parsed, AUG16_10 - 1000);
  assert.equal(schedule.next?.tagA, 'TS');
  assert.equal(schedule.next?.stageShort, 'UB2');
  assert.equal(shortenStage('Lower Bracket R2'), 'LB2');
  assert.equal(shortenStage('Group A'), 'GA');
  assert.equal(shortenStage(''), '');
});

test('the bracket row naming both teams is marked without being told', () => {
  const parsed = parseScheduleFile(FILE);
  const schedule = buildSchedule(parsed, AUG16_10 - 1000);
  const marked = schedule.bracket.filter((row) => row.next);
  assert.equal(marked.length, 1);
  assert.equal(marked[0]?.label, 'UB R2');
});

test('an explicit next flag beats the name-matching heuristic', () => {
  const raw = JSON.stringify({
    matches: [{ teamA: 'Spirit', teamB: 'Falcons', startsAt: '2026-08-16T10:00:00+08:00' }],
    bracket: [
      { label: 'A', text: 'Spirit vs Falcons' },
      { label: 'B', text: 'Someone else', next: true },
    ],
  });
  const schedule = buildSchedule(parseScheduleFile(raw), AUG16_10 - 1000);
  assert.deepEqual(
    schedule.bracket.filter((row) => row.next).map((row) => row.label),
    ['B'],
  );
});

test('bad files fail with the offending field named', () => {
  assert.throws(() => parseScheduleFile('{'), ScheduleFileError);
  assert.throws(() => parseScheduleFile('[]'), /top level/);
  assert.throws(() => parseScheduleFile('{"matches":{}}'), /must be an array/);
  assert.throws(() => parseScheduleFile('{"matches":[{"teamA":"A"}]}'), /matches\[0\]/);
  assert.throws(
    () =>
      parseScheduleFile('{"matches":[{"teamA":"A","teamB":"B","startsAt":"whenever"}]}'),
    /startsAt is not a date/,
  );
});

test('a match with no time is kept as a TBD fallback', () => {
  const raw = JSON.stringify({ matches: [{ teamA: 'A', teamB: 'B' }] });
  const schedule = buildSchedule(parseScheduleFile(raw), Date.now());
  assert.equal(schedule.next?.startsAtMs, null);
});

test('a missing file is silence, not a crash', async () => {
  const source = new JsonScheduleSource(join(tmpdir(), 'busybar-nope-12345.json'));
  assert.equal(await source.poll(), null);
});

test('edits to the file are picked up without a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'busybar-schedule-'));
  const path = join(dir, 'schedule.json');
  writeFileSync(path, FILE);

  const source = new JsonScheduleSource(path, () => AUG16_10 - 1000);
  assert.equal((await source.poll())?.next?.teamA, 'Team Spirit');

  writeFileSync(
    path,
    JSON.stringify({
      matches: [
        { teamA: 'Nigma', teamB: 'Aurora', startsAt: '2026-08-16T11:00:00+08:00' },
      ],
    }),
  );
  assert.equal((await source.poll())?.next?.teamA, 'Nigma');
});

test('stratz series types map to best-of counts', () => {
  assert.equal(seriesTypeToBestOf(0), 1);
  assert.equal(seriesTypeToBestOf(1), 3);
  assert.equal(seriesTypeToBestOf(2), 5);
  assert.equal(seriesTypeToBestOf(null), 0);
});

test('stratz parses the documented node shape into a schedule', async () => {
  // Locks in what the parser expects, so a live response that differs shows up
  // as a diff against this rather than as an empty display.
  const body = {
    data: {
      league: {
        nodeGroups: [
          {
            name: 'Upper Bracket R2',
            nodes: [
              {
                name: 'A vs B',
                scheduledTime: Math.floor(AUG16_10 / 1000),
                isCompleted: false,
                seriesType: 1,
                teamOne: { name: 'Team Spirit', tag: 'TS' },
                teamTwo: { name: 'Falcons' },
              },
              {
                name: 'done',
                scheduledTime: Math.floor((AUG16_10 - 7_200_000) / 1000),
                isCompleted: true,
                teamOneWins: 2,
                teamTwoWins: 0,
                teamOne: { name: 'Tundra' },
                teamTwo: { name: 'Liquid' },
              },
            ],
          },
        ],
      },
    },
  };

  const source = new StratzScheduleSource(
    { token: 'x', leagueId: 1, timeoutMs: 1000 },
    () => Promise.resolve(new Response(JSON.stringify(body))),
  );

  const schedule = await source.poll();
  assert.equal(schedule?.next?.teamA, 'Team Spirit');
  assert.equal(schedule?.next?.tagA, 'TS');
  assert.equal(schedule?.next?.tagB, 'FAL');
  assert.equal(schedule?.next?.bestOf, 3);
  assert.equal(schedule?.next?.startsAtMs, AUG16_10);
  assert.equal(schedule?.bracket[1]?.text, 'Tundra 2-0 Liquid');
});

test('stratz surfaces GraphQL errors instead of showing an empty bracket', async () => {
  const source = new StratzScheduleSource(
    { token: 'x', leagueId: 1, timeoutMs: 1000 },
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ errors: [{ message: 'Cannot query field' }] })),
      ),
  );
  await assert.rejects(() => source.poll(), /Cannot query field/);
});

test('a 403 from stratz explains both likely causes', async () => {
  const source = new StratzScheduleSource(
    { token: 'x', leagueId: 1, timeoutMs: 1000 },
    () => Promise.resolve(new Response('', { status: 403 })),
  );
  await assert.rejects(() => source.poll(), /token is wrong or Cloudflare/);
});
