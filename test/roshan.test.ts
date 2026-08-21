import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frontElements } from '../src/bar/elements';
import { FONT_WIDTH, FRONT } from '../src/bar/layout';
import { COLORS } from '../src/view/colors';
import { emptyTeam, idleSnapshot, type MatchSnapshot } from '../src/dota/types';
import { buildFrame } from '../src/view/frame';
import { frameOptions } from './helpers';

const options = frameOptions();

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: 'm1',
    gameTimeSec: 1200,
    seriesType: 1,
    radiant: { ...emptyTeam('Team Spirit', 'TS'), kills: 9, towers: 9 },
    dire: { ...emptyTeam('Falcons', 'FLC'), kills: 7, towers: 8 },
    roshanRespawnSec: 0,
    ...overrides,
  };
}

function centreOf(frame: ReturnType<typeof buildFrame>) {
  const element = frontElements(frame).find((candidate) => candidate.id === 'series');
  assert.ok(element && element.type === 'text');

  return element;
}

test('a dead Roshan puts a countdown on the front', () => {
  const frame = buildFrame(snapshot({ roshanRespawnSec: 360 }), options);
  assert.equal(frame.roshanText, 'R6:00');
  assert.equal(centreOf(frame).text, 'R6:00');
  assert.equal(centreOf(frame).color, COLORS.roshan);
});

test('a live Roshan leaves the series score where it was', () => {
  const frame = buildFrame(snapshot({ roshanRespawnSec: 0 }), options);
  assert.equal(frame.roshanText, '');
  assert.equal(centreOf(frame).text, frame.seriesText);
  assert.equal(centreOf(frame).color, COLORS.muted);
});

test('a long wait drops the seconds so the row still fits', () => {
  const frame = buildFrame(
    snapshot({ roshanRespawnSec: 660, netWorthLead: 12_300 }),
    options,
  );
  assert.equal(frame.roshanText, 'R11m');
  assert.equal(frame.leadText, '+12.3k');

  // Clock on the left, countdown centred, gold lead on the right: 72px, no overlap.
  const clockEnd = 1 + frame.clockText.length * FONT_WIDTH.tiny;
  const countdown = frame.roshanText.length * FONT_WIDTH.tiny;
  const centre = Math.floor(FRONT.width / 2);
  const leadStart = FRONT.width - 1 - frame.leadText.length * FONT_WIDTH.tiny;

  assert.ok(clockEnd <= centre - countdown / 2, `clock runs to ${clockEnd}px`);
  assert.ok(centre + countdown / 2 <= leadStart, `lead starts at ${leadStart}px`);
});

test('an event takes the row back from the countdown', () => {
  const frame = buildFrame(snapshot({ roshanRespawnSec: 360 }), {
    ...options,
    ticker: {
      event: {
        kind: 'roshan',
        side: null,
        text: 'Roshan killed',
        priority: 75,
        sound: true,
      },
      elapsedMs: 0,
    },
  });

  assert.equal(centreOf(frame).color, COLORS.transparent);
  assert.equal(frame.tickerText, 'Roshan killed');
});

test('the back line carries the countdown too, next to the towers', () => {
  const frame = buildFrame(
    snapshot({ roshanRespawnSec: 360, netWorthLead: 4200 }),
    options,
  );
  assert.equal(frame.backSub, 'TS +4.2k  T 9-8  R6:00');
});

test('the draft has no Roshan to wait for', () => {
  const drafting = buildFrame(
    snapshot({
      gameTimeSec: -20,
      roshanRespawnSec: 360,
      radiant: { ...emptyTeam('Team Spirit', 'TS'), draft: { picks: [8], bans: [1] } },
    }),
    options,
  );

  assert.equal(drafting.mode, 'draft');
  assert.equal(drafting.roshanText, '');
});
