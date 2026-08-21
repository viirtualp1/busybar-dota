import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRONT, LEAD_CAP, MIN_FILL, radiantFillWidth } from '../src/bar/layout';
import {
  deriveTag,
  emptyTeam,
  idleSnapshot,
  type MatchSnapshot,
} from '../src/dota/types';
import { buildFrame, ROSTER_ROTATE_MS } from '../src/view/frame';
import { formatClock, formatGold } from '../src/view/format';

import { frameOptions, heroes, pairOf } from './helpers';

const options = frameOptions({ maxRows: 5 });

function player(name: string, heroId: number) {
  return { heroId, name, kills: 1, deaths: 2, assists: 3, netWorth: 9000, level: 20 };
}

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: '1',
    radiant: { ...emptyTeam('Team Spirit', 'TS'), kills: 12, towers: 11 },
    dire: { ...emptyTeam('Falcons', 'FLC'), kills: 8, towers: 9 },
    gameTimeSec: 1453,
    ...overrides,
  };
}

test('an even game splits the front display down the middle', () => {
  assert.equal(radiantFillWidth(0), FRONT.width / 2);
});

test('the lead bar always leaves both colours visible', () => {
  assert.equal(radiantFillWidth(LEAD_CAP * 10), FRONT.width - MIN_FILL);
  assert.equal(radiantFillWidth(-LEAD_CAP * 10), MIN_FILL);
});

test('a Radiant lead grows the Radiant side', () => {
  assert.ok(radiantFillWidth(8000) > radiantFillWidth(0));
  assert.ok(radiantFillWidth(-8000) < radiantFillWidth(0));
});

test('the front shows the kill score and clock', () => {
  const frame = buildFrame(snapshot(), options);
  assert.equal(frame.scoreText, '12-8');
  assert.equal(frame.clockText, '24:13');
  assert.equal(frame.mode, 'live');
});

test('the pre-horn countdown reads as negative time', () => {
  assert.equal(formatClock(-42), '-0:42');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(605), '10:05');
});

test('net worth uses the compact form casters use', () => {
  assert.equal(formatGold(840), '840');
  assert.equal(formatGold(12_345), '12.3k');
  assert.equal(formatGold(-4200), '4.2k');
  assert.equal(formatGold(120_000), '120k');
});

test('the lead subtitle names the team that is ahead', () => {
  const ahead = buildFrame(snapshot({ netWorthLead: 4200 }), options);
  assert.match(ahead.backSub, /^TS \+4\.2k/);
  const behind = buildFrame(snapshot({ netWorthLead: -4200 }), options);
  assert.match(behind.backSub, /^FLC -4\.2k/);
});

test('an idle snapshot yields a blank roster instead of stale rows', () => {
  const frame = buildFrame(idleSnapshot(), { ...options, idleNote: 'no games' });
  assert.equal(frame.mode, 'idle');
  assert.equal(frame.backRows.length, options.maxRows);
  assert.ok(
    frame.backRows.every((row) => {
      const { left, right } = pairOf(row);
      return left === null && right === null;
    }),
  );
});

test('a named roster alternates between hero and nickname', () => {
  const withNames = snapshot({
    radiant: {
      ...emptyTeam('Team Spirit', 'TS'),
      players: [player('Yatoro', 40), player('Larl', 15)],
    },
  });
  const heroAt = (nowEpochMs: number) =>
    pairOf(buildFrame(withNames, frameOptions({ maxRows: 5, nowEpochMs })).backRows[0])
      .left?.hero;

  assert.equal(heroAt(0), '#40');
  assert.equal(heroAt(ROSTER_ROTATE_MS), 'Yatoro');
  assert.equal(heroAt(ROSTER_ROTATE_MS * 2), '#40');
});

test('an unnamed player stays on the hero name rather than blanking out', () => {
  const nameless = snapshot({
    radiant: { ...emptyTeam('Team Spirit', 'TS'), players: [player('', 40)] },
  });
  const cellAt = (nowEpochMs: number) =>
    pairOf(buildFrame(nameless, frameOptions({ maxRows: 5, nowEpochMs })).backRows[0])
      .left?.hero;

  assert.equal(cellAt(0), '#40');
  assert.equal(cellAt(ROSTER_ROTATE_MS), '#40');
});

test('tags fall back to initials when the API gives no short name', () => {
  assert.equal(deriveTag('Team Spirit', 'RAD'), 'TS');
  assert.equal(deriveTag('Falcons', 'DIR'), 'FAL');
  assert.equal(deriveTag('', 'RAD'), 'RAD');
});

test('unknown heroes degrade to their id rather than throwing', () => {
  assert.equal(heroes.name(999), '#999');
  assert.equal(heroes.name(0), '-');
});
