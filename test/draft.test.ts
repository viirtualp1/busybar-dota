import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements } from '../src/bar/elements.js';
import { DemoSource } from '../src/dota/source.js';
import {
  emptyTeam,
  idleSnapshot,
  isDrafting,
  type MatchSnapshot,
} from '../src/dota/types.js';
import { buildFrame } from '../src/view/frame.js';

import { frameOptions, pairOf } from './helpers.js';

const options = frameOptions();

function drafting(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: 'm1',
    gameTimeSec: -35,
    radiant: {
      ...emptyTeam('Team Spirit', 'TS'),
      draft: { picks: [8, 74], bans: [1, 14, 47] },
    },
    dire: {
      ...emptyTeam('Falcons', 'FLC'),
      draft: { picks: [11], bans: [6, 21] },
    },
    ...overrides,
  };
}

test('a game with draft data before the horn counts as drafting', () => {
  assert.equal(isDrafting(drafting()), true);
});

test('the draft ends once the clock passes zero', () => {
  assert.equal(isDrafting(drafting({ gameTimeSec: 1 })), false);
});

test('a source with no draft data never enters draft mode', () => {
  const noDraft = drafting({
    radiant: emptyTeam('Team Spirit', 'TS'),
    dire: emptyTeam('Falcons', 'FLC'),
  });
  assert.equal(isDrafting(noDraft), false);
});

test('the front says DRAFT instead of a meaningless countdown', () => {
  const frame = buildFrame(drafting(), options);
  assert.equal(frame.mode, 'draft');
  assert.equal(frame.clockText, 'DRAFT');
});

test('draft rows list picks in order, one column per team', () => {
  const frame = buildFrame(drafting(), options);
  assert.equal(pairOf(frame.backRows[0]).left?.stats, '#1');
  assert.equal(pairOf(frame.backRows[1]).left?.stats, '#2');
  // Dire only picked once, so its second slot stays empty rather than shifting up.
  assert.equal(pairOf(frame.backRows[1]).right, null);
});

test('the ban summary counts both sides and names the latest ban', () => {
  const frame = buildFrame(drafting(), options);
  assert.match(frame.backSub, /^BANS 3-2/);
  assert.match(frame.backSub, /#47 \/ #21$/);
});

test('the roster replaces the draft once the game is running', () => {
  const running = drafting({ gameTimeSec: 300 });
  const frame = buildFrame(running, options);
  assert.equal(frame.mode, 'live');
  assert.match(frame.clockText, /^5:00$/);
});

test('the back display carries a divider, since grey hides team colour', () => {
  const elements = backElements(buildFrame(drafting(), options));
  const divider = elements.find((element) => element.id === 'column-divider');
  assert.ok(divider, 'expected a column divider element');
  assert.equal(divider.type, 'rectangle');
});

test('the demo walks through a draft before the game starts', async () => {
  // Two seconds in is mid-draft at the demo's 20x speed.
  const midDraft = await new DemoSource(Date.now() - 2000).poll();
  assert.ok(midDraft);
  assert.equal(isDrafting(midDraft), true);
  assert.ok(midDraft.radiant.draft.bans.length > 0);

  const running = await new DemoSource(Date.now() - 20_000).poll();
  assert.ok(running);
  assert.equal(isDrafting(running), false);
});
