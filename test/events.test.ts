import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectEvent, initialEventState, stateOf } from '../src/domain/events';
import { EventTicker } from '../src/domain/ticker';
import { emptyTeam, idleSnapshot, type MatchSnapshot } from '../src/dota/types';

const ALL_TOWERS = 0b111_1111_1111;
const ALL_BARRACKS = 0b11_1111;

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: 'm1',
    seriesType: 1,
    radiant: {
      ...emptyTeam('Radiant', 'RAD'),
      kills: 5,
      towers: 11,
      towerState: ALL_TOWERS,
      barracksState: ALL_BARRACKS,
    },
    dire: {
      ...emptyTeam('Dire', 'DIR'),
      kills: 3,
      towers: 11,
      towerState: ALL_TOWERS,
      barracksState: ALL_BARRACKS,
    },
    roshanRespawnSec: 0,
    ...overrides,
  };
}

function withDireTowers(mask: number): MatchSnapshot {
  const base = snapshot();

  return { ...base, dire: { ...base.dire, towerState: mask } };
}

function player(heroId: number, kills: number, deaths: number) {
  return {
    heroId,
    name: '',
    kills,
    deaths,
    assists: 0,
    netWorth: 0,
    level: 1,
  };
}

test('the first live poll of a match reports a start', () => {
  const { event } = detectEvent(initialEventState, snapshot());
  assert.equal(event?.kind, 'match-start');
  assert.equal(event?.sound, true);
  assert.equal(event?.text, '');
});

test('a fallen tower is named by lane and tier, not just counted', () => {
  const before = stateOf(snapshot());

  const { event } = detectEvent(before, withDireTowers(ALL_TOWERS & ~(1 << 4)));
  assert.equal(event?.kind, 'tower');
  assert.equal(event?.side, 'dire');
  assert.match(event.text, /mid tier 2 tower/);
});

test('both tier-4 bits read as T4, since their order is not worth asserting', () => {
  const before = stateOf(snapshot());
  const nine = detectEvent(before, withDireTowers(ALL_TOWERS & ~(1 << 9)));
  const ten = detectEvent(before, withDireTowers(ALL_TOWERS & ~(1 << 10)));
  assert.match(nine.event!.text, /tier 4 tower/);
  assert.match(ten.event!.text, /tier 4 tower/);
});

test('two towers at once are both named, and the noun agrees', () => {
  const before = stateOf(snapshot());
  const { event } = detectEvent(
    before,
    withDireTowers(ALL_TOWERS & ~(1 << 0) & ~(1 << 3)),
  );
  assert.equal(event!.text, 'DIR lost top tier 1 and mid tier 1 towers');
});

test('barracks stay singular in wording, since the word already is', () => {
  const before = stateOf(snapshot());
  const base = snapshot();
  const { event } = detectEvent(before, {
    ...base,
    dire: { ...base.dire, barracksState: ALL_BARRACKS & ~(1 << 2) & ~(1 << 3) },
  });
  assert.equal(event!.text, 'DIR lost mid melee and mid ranged barracks');
});

test('barracks outrank towers, and towers outrank kills', () => {
  const before = stateOf(snapshot());
  const base = snapshot();
  const { event } = detectEvent(before, {
    ...base,
    radiant: { ...base.radiant, kills: 9 },
    dire: {
      ...base.dire,
      towerState: ALL_TOWERS & ~(1 << 4),
      barracksState: ALL_BARRACKS & ~(1 << 2),
    },
  });
  assert.equal(event?.kind, 'barracks');
});

test('Roshan is detected by the respawn timer jumping up', () => {
  const before = stateOf(snapshot({ roshanRespawnSec: 0 }));
  const { event } = detectEvent(before, snapshot({ roshanRespawnSec: 8 * 60 }));
  assert.equal(event?.kind, 'roshan');
  assert.equal(event?.sound, true);
});

test('the Roshan timer ticking down is not a kill', () => {
  const before = stateOf(snapshot({ roshanRespawnSec: 500 }));
  const { event } = detectEvent(before, snapshot({ roshanRespawnSec: 480 }));
  assert.equal(event, null);
});

test('kills are reported but stay silent', () => {
  const before = stateOf(snapshot());
  const base = snapshot();
  const { event } = detectEvent(before, {
    ...base,
    radiant: { ...base.radiant, kills: 6 },
  });
  assert.equal(event?.kind, 'kill');
  assert.equal(event?.sound, false);
  assert.equal(event?.text, 'RAD kill');
});

test('a kill names the heroes when the scoreboard has K/D', () => {
  const base = snapshot();
  const before = stateOf({
    ...base,
    radiant: { ...base.radiant, players: [player(8, 2, 0)] },
    dire: { ...base.dire, players: [player(11, 1, 1)] },
  });
  const { event } = detectEvent(
    before,
    {
      ...base,
      radiant: { ...base.radiant, kills: 6, players: [player(8, 3, 0)] },
      dire: { ...base.dire, players: [player(11, 1, 2)] },
    },
    (id) => (id === 8 ? 'Jugger' : id === 11 ? 'SF' : `#${id}`),
  );
  assert.equal(event?.kind, 'kill');
  assert.equal(event?.text, 'Jugger killed SF');
});

test('a source without building masks never invents a fallen tower', () => {
  const before = stateOf(snapshot());
  const base = snapshot();
  const { event } = detectEvent(before, {
    ...base,
    dire: { ...base.dire, towerState: null, barracksState: null },
  });
  assert.equal(event, null);
});

test('a new match is a start, not a phantom swing from the old scoreline', () => {
  const base = snapshot();
  const before = stateOf({ ...base, radiant: { ...base.radiant, kills: 40 } });
  const { event } = detectEvent(before, snapshot({ matchId: 'm2' }));
  assert.equal(event?.kind, 'match-start');
});

test('losing the source is a match end, and staying idle is silent', () => {
  const before = stateOf(snapshot());
  const ended = detectEvent(before, { ...snapshot(), live: false });
  assert.equal(ended.event?.kind, 'match-end');
  assert.equal(detectEvent(ended.state, idleSnapshot()).event, null);
});

test('the ticker holds an event, then gets out of the way', () => {
  const ticker = new EventTicker(1000);
  const tower = detectEvent(stateOf(snapshot()), withDireTowers(ALL_TOWERS & ~1)).event;
  assert.equal(ticker.push(tower, 0), true);
  assert.equal(ticker.active(500)?.event.kind, 'tower');
  assert.equal(ticker.active(1500), null);
});

test('a kill cannot cut a Roshan line short, but a rax can', () => {
  const ticker = new EventTicker(1000);
  const roshan = detectEvent(
    stateOf(snapshot({ roshanRespawnSec: 0 })),
    snapshot({ roshanRespawnSec: 500 }),
  ).event;
  ticker.push(roshan, 0);

  const base = snapshot();
  const kill = detectEvent(stateOf(base), {
    ...base,
    radiant: { ...base.radiant, kills: 6 },
  }).event;
  assert.equal(ticker.push(kill, 100), false);
  assert.equal(ticker.active(200)?.event.kind, 'roshan');

  const rax = detectEvent(stateOf(base), {
    ...base,
    dire: { ...base.dire, barracksState: ALL_BARRACKS & ~(1 << 2) },
  }).event;
  assert.equal(ticker.push(rax, 200), true);
  assert.equal(ticker.active(300)?.event.kind, 'barracks');
});
