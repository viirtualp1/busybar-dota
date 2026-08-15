import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectEvent, initialEventState, stateOf } from '../src/domain/events.js';
import { emptyTeam, idleSnapshot, type MatchSnapshot } from '../src/dota/types.js';

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: 'm1',
    radiant: { ...emptyTeam('R', 'R'), kills: 5, towers: 11 },
    dire: { ...emptyTeam('D', 'D'), kills: 3, towers: 11 },
    ...overrides,
  };
}

test('the first live poll of a match reports a start', () => {
  const { event } = detectEvent(initialEventState, snapshot());
  assert.equal(event, 'match-start');
});

test('a kill is attributed to the team that scored it', () => {
  const before = stateOf(snapshot());
  const radiant = detectEvent(
    before,
    snapshot({ radiant: { ...emptyTeam('R', 'R'), kills: 6, towers: 11 } }),
  );
  assert.equal(radiant.event, 'radiant-kill');
  const dire = detectEvent(
    before,
    snapshot({ dire: { ...emptyTeam('D', 'D'), kills: 4, towers: 11 } }),
  );
  assert.equal(dire.event, 'dire-kill');
});

test('towers outrank kills when both change in one poll', () => {
  const before = stateOf(snapshot());
  const { event } = detectEvent(
    before,
    snapshot({
      radiant: { ...emptyTeam('R', 'R'), kills: 7, towers: 10 },
      dire: { ...emptyTeam('D', 'D'), kills: 5, towers: 11 },
    }),
  );
  assert.equal(event, 'radiant-tower');
});

test('a new match is a start, not a phantom swing from the old scoreline', () => {
  const before = stateOf(
    snapshot({ radiant: { ...emptyTeam('R', 'R'), kills: 40, towers: 2 } }),
  );
  const { event } = detectEvent(before, snapshot({ matchId: 'm2' }));
  assert.equal(event, 'match-start');
});

test('losing the source is a match end, and staying idle is silent', () => {
  const before = stateOf(snapshot());
  const ended = detectEvent(before, { ...snapshot(), live: false });
  assert.equal(ended.event, 'match-end');
  assert.equal(detectEvent(ended.state, idleSnapshot()).event, null);
});

test('a source without building state never fakes a tower fall', () => {
  const withTowers = stateOf(snapshot());
  const { event } = detectEvent(
    withTowers,
    snapshot({ radiant: { ...emptyTeam('R', 'R'), kills: 5, towers: null } }),
  );
  assert.equal(event, null);
});
