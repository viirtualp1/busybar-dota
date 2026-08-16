import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements } from '../src/bar/elements.js';
import { DemoScheduleSource, NO_SCHEDULE, type Schedule } from '../src/dota/schedule/index.js';
import { idleSnapshot } from '../src/dota/types.js';
import { buildFrame } from '../src/view/frame.js';
import { formatCountdown, formatStartTime } from '../src/view/format.js';
import { frameOptions, schedule, wideOf } from './helpers.js';

const NOW = Date.UTC(2026, 7, 16, 6, 0, 0);

test('the countdown shrinks its unit as the wait shortens', () => {
  assert.equal(formatCountdown(3 * 86_400_000 + 5 * 3_600_000), '3d 5h');
  assert.equal(formatCountdown(3_600_000 + 125_000), '1:02:05');
  assert.equal(formatCountdown(125_000), '2:05');
  assert.equal(formatCountdown(5_000), '0:05');
});

test('an overdue start reads SOON rather than counting up', () => {
  // Schedules slip constantly; a negative countdown looks like a bug.
  assert.equal(formatCountdown(0), 'SOON');
  assert.equal(formatCountdown(-60_000), 'SOON');
});

test('nothing live plus a schedule gives the upcoming view', () => {
  const frame = buildFrame(idleSnapshot(), frameOptions({ nowEpochMs: NOW, schedule: schedule() }));
  assert.equal(frame.mode, 'upcoming');
  // Two hours out, in the 8:00 UTC fixture.
  assert.equal(frame.scoreText, '2:00:00');
  assert.equal(frame.radiantTag, 'TS');
  assert.equal(frame.direTag, 'FLC');
  assert.equal(frame.seriesText, 'UB2');
  assert.equal(frame.clockText, formatStartTime(Date.UTC(2026, 7, 16, 8, 0, 0)));
});

test('the back line carries the date, stage and series length', () => {
  const frame = buildFrame(idleSnapshot(), frameOptions({ nowEpochMs: NOW, schedule: schedule() }));
  assert.match(frame.backSub, /Aug/);
  assert.match(frame.backSub, /Upper Bracket R2/);
  assert.match(frame.backSub, /BO3/);
  assert.equal(frame.backHeader, 'Team Spirit | Falcons');
});

test('a TBD start shows TBD instead of a countdown to nothing', () => {
  const tbd = schedule();
  const next = { ...tbd.next!, startsAtMs: null };
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: { ...tbd, next } }),
  );
  assert.equal(frame.scoreText, 'TBD');
  assert.equal(frame.clockText, '');
  assert.match(frame.backSub, /start TBD/);
});

test('the bracket marks the upcoming tie and keeps it on screen', () => {
  const frame = buildFrame(idleSnapshot(), frameOptions({ nowEpochMs: NOW, schedule: schedule() }));
  const highlighted = frame.backRows.filter(
    (row) => row.kind === 'wide' && row.highlight,
  );
  assert.equal(highlighted.length, 1);
  assert.equal(wideOf(highlighted[0]).label, 'UB R2');
});

test('a long bracket scrolls so the next match stays visible', () => {
  const long: Schedule = {
    next: schedule().next,
    bracket: Array.from({ length: 12 }, (_, index) => ({
      label: `R${index}`,
      text: `A vs B ${index}`,
      next: index === 9,
    })),
  };
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ nowEpochMs: NOW, schedule: long, maxRows: 5 }),
  );
  const labels = frame.backRows.map((row) => wideOf(row).label);
  assert.ok(labels.includes('R9'), `expected R9 on screen, got ${labels.join(',')}`);
});

test('the two-column divider is hidden for a full-width bracket', () => {
  const frame = buildFrame(idleSnapshot(), frameOptions({ nowEpochMs: NOW, schedule: schedule() }));
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
  assert.equal(demo.bracket.filter((row) => row.next).length, 1);
});
