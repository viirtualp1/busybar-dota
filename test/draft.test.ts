import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements } from '../src/bar/elements';
import { DemoSource } from '../src/dota/source';
import {
  emptyTeam,
  idleSnapshot,
  isDrafting,
  type MatchSnapshot,
} from '../src/dota/types';
import { buildFrame, DRAFT_SLOTS } from '../src/view/frame';

import { frameOptions, pairOf } from './helpers';

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

  assert.equal(pairOf(frame.backRows[0]).right?.stats, '#1');
});

test('every draft slot is drawn from the start, so picks fill a visible board', () => {
  const frame = buildFrame(drafting(), options);
  for (let index = 0; index < DRAFT_SLOTS; index += 1) {
    const row = pairOf(frame.backRows[index]);
    assert.ok(row.left, `radiant slot ${index + 1} is missing`);
    assert.ok(row.right, `dire slot ${index + 1} is missing`);
  }

  // Radiant has two picks, dire one; the rest are waiting slots, not blank rows.
  assert.equal(pairOf(frame.backRows[1]).right?.hero, '-');
  assert.equal(pairOf(frame.backRows[4]).left?.hero, '-');
});

test('a hero shows up the moment it is picked', () => {
  const before = buildFrame(drafting(), options);
  const after = buildFrame(
    drafting({
      dire: { ...emptyTeam('Falcons', 'FLC'), draft: { picks: [11, 41], bans: [6, 21] } },
    }),
    options,
  );

  assert.equal(pairOf(before.backRows[1]).right?.hero, '-');
  assert.equal(pairOf(after.backRows[1]).right?.hero, '#41');
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
  const midDraft = await new DemoSource(Date.now() - 2000).poll();
  assert.ok(midDraft);
  assert.equal(isDrafting(midDraft), true);
  assert.ok(midDraft.radiant.draft.bans.length > 0);

  const running = await new DemoSource(Date.now() - 20_000).poll();
  assert.ok(running);
  assert.equal(isDrafting(running), false);
});
