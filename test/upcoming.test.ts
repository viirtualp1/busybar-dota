import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements } from '../src/bar/elements';
import {
  DemoScheduleSource,
  NO_SCHEDULE,
  type Schedule,
} from '../src/dota/schedule/index';
import { idleSnapshot } from '../src/dota/types';
import { buildFrame } from '../src/view/frame';
import { formatCountdown } from '../src/view/format';
import { frameOptions, schedule, wideOf } from './helpers';

const NOW = Date.UTC(2026, 7, 16, 6, 0, 0);

test('the countdown shrinks its unit as the wait shortens', () => {
  assert.equal(formatCountdown(3 * 86_400_000 + 5 * 3_600_000), '3d 5h');
  assert.equal(formatCountdown(3_600_000 + 125_000), '1:02:05');
  assert.equal(formatCountdown(125_000), '2:05');
  assert.equal(formatCountdown(5_000), '0:05');
});

test('an overdue start reads SOON rather than counting up', () => {
  assert.equal(formatCountdown(0), 'SOON');
  assert.equal(formatCountdown(-60_000), 'SOON');
});

test('nothing live plus a schedule gives the upcoming view', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: schedule() }),
  );
  assert.equal(frame.mode, 'upcoming');

  assert.equal(frame.scoreText, '2:00:00');

  assert.equal(frame.radiantTag, '');
  assert.equal(frame.direTag, '');
  assert.equal(frame.seriesText, '');

  assert.equal(frame.tickerText, 'TS VS FLC');

  const roomy = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: schedule(), tickerChars: 24 }),
  );
  assert.equal(roomy.tickerText, 'Team Spirit VS Falcons');
});

test('a series already under way shows its score instead of VS', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({
      seriesBreak: {
        radiantName: 'Spirit',
        direName: 'Falcons',
        radiantTag: 'TS',
        direTag: 'FLC',
        radiantWins: 1,
        direWins: 0,
        nextGame: 2,
        winsNeeded: 2,
        lastMatchId: 'm1',
        pendingResult: false,
        lastWinner: 'radiant',
        startedAtMs: 0,
      },

      nowEpochMs: 5 * 60 * 1000,
      tickerChars: 30,
    }),
  );
  assert.equal(frame.mode, 'series-break');
  assert.equal(frame.tickerText, 'Spirit 1-0 Falcons');
});

test('names fall back to tags rather than being clipped or paged', () => {
  const narrow = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: schedule(), tickerChars: 12 }),
  );
  assert.equal(narrow.tickerText, 'TS VS FLC');
  assert.ok(narrow.tickerText.length <= 12);
});

test('the back line carries the date and series length, not the stage', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: schedule() }),
  );
  assert.match(frame.backSub, /Aug/);
  assert.match(frame.backSub, /BO3/);
  assert.doesNotMatch(frame.backSub, /Upper Bracket/);
  assert.equal(frame.backHeader, 'Team Spirit | Falcons');
});

test('the waiting line never changes, whatever the clock says', () => {
  const lines = new Set(
    [0, 1234, 987_654_321].map(
      (nowEpochMs) =>
        buildFrame(idleSnapshot(), frameOptions({ nowEpochMs, schedule: schedule() }))
          .tickerText,
    ),
  );
  assert.equal(lines.size, 1, `the line moved: ${[...lines].join(' | ')}`);
});

test('the back lists upcoming matches with start times, not only the next one', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: schedule() }),
  );
  const rows = frame.backRows
    .filter((row) => row.kind === 'wide')
    .map((row) => wideOf(row))
    .filter((row) => row.text);
  assert.ok(rows.length >= 2, 'expected more than the next match');
  assert.match(rows[0]!.label, /^\d{2}:\d{2}$/);
  assert.match(rows[0]!.text, /Spirit|TS/);
  assert.equal(rows[0]!.highlight, true);
  assert.match(rows[1]!.label, /^\d{2}:\d{2}$/);
  assert.match(rows[1]!.text, /Tundra|Liquid|TUND|LIQ/);
  assert.equal(rows[1]!.highlight, false);
});

test('a TBD start shows TBD instead of a countdown to nothing', () => {
  const tbd = schedule();
  const next = { ...tbd.next!, startsAtMs: null };
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({
      nowEpochMs: NOW,
      schedule: { ...tbd, next, upcoming: [next, ...tbd.upcoming.slice(1)] },
    }),
  );
  assert.equal(frame.scoreText, 'TBD');
  assert.equal(frame.clockText, '');
  assert.match(frame.backSub, /start TBD/);
  assert.equal(wideOf(frame.backRows[0]).label, 'TBD');
});

test('the next match is highlighted on the back list', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: schedule() }),
  );
  const highlighted = frame.backRows.filter(
    (row) => row.kind === 'wide' && row.highlight,
  );
  assert.equal(highlighted.length, 1);
  assert.match(wideOf(highlighted[0]).text, /Spirit|TS/);
});

test('a long upcoming list keeps the soonest matches', () => {
  const next = schedule().next!;
  const long: Schedule = {
    next,
    upcoming: Array.from({ length: 12 }, (_, index) => ({
      teamA: 'A',
      teamB: `B${index}`,
      tagA: 'A',
      tagB: `B${index}`,
      startsAtMs: (next.startsAtMs ?? 0) + index * 3_600_000,
      stage: '',
      stageShort: '',
      bestOf: 1,
    })),
    bracket: [],
  };
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: long, maxRows: 5 }),
  );
  const texts = frame.backRows.map((row) => wideOf(row).text);
  assert.ok(
    texts.some((text) => text.includes('B0')),
    `expected B0 on screen, got ${texts.join(',')}`,
  );
  assert.ok(
    !texts.some((text) => text.includes('B9')),
    `later matches should wait, got ${texts.join(',')}`,
  );
});

test('the two-column divider is hidden for a full-width bracket', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: schedule() }),
  );
  assert.equal(frame.showDivider, false);
  assert.equal(frame.showBands, false);
  const divider = backElements(frame).find((el) => el.id === 'column-divider');
  assert.ok(divider);
  assert.equal(divider.type, 'rectangle');
  assert.equal(divider.fill_colors?.[0], '#00000000');
});

test('no schedule source falls back to the plain idle screen', async () => {
  assert.equal(await NO_SCHEDULE.poll(), null);
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: null, idleNote: 'nothing live' }),
  );
  assert.equal(frame.mode, 'idle');
  assert.equal(frame.backSub, 'nothing live');
});

test('the demo schedule is far enough out to exercise the countdown', async () => {
  const demo = await new DemoScheduleSource().poll();
  assert.ok(demo.next?.startsAtMs);
  assert.ok(demo.next.startsAtMs > Date.now());
  assert.ok(demo.upcoming.length > 1);
  assert.equal(demo.bracket.filter((row) => row.next).length, 1);
});
