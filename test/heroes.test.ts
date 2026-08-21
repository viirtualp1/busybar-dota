import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeroCatalog } from '../src/dota/heroes';
import { createSource, MISSING_KEY } from '../src/dota/source';

const BODY = {
  result: {
    heroes: [
      { name: 'npc_dota_hero_antimage', id: 1, localized_name: 'Anti-Mage' },
      { name: 'npc_dota_hero_juggernaut', id: 8, localized_name: 'Juggernaut' },
    ],
  },
};

function catalog(body: unknown, status = 200) {
  const calls: string[] = [];

  return {
    calls,
    heroes: new HeroCatalog('key', (url) => {
      calls.push(url instanceof URL ? url.href : '');

      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  };
}

test('hero names and icon slugs come from the Steam catalogue', async () => {
  const { heroes, calls } = catalog(BODY);
  assert.equal(await heroes.load(), true);

  assert.match(calls[0] ?? '', /IEconDOTA2_570\/GetHeroes/);
  assert.match(calls[0] ?? '', /language=en/);
  assert.equal(heroes.name(8), 'Juggernaut');
  assert.equal(heroes.slug(8), 'juggernaut');
  // Long names are still shortened for the 40px column.
  assert.equal(heroes.name(1), 'AM');
});

test('a catalogue that will not load degrades to hero ids', async () => {
  const { heroes } = catalog({}, 403);
  assert.equal(await heroes.load(), false);
  assert.equal(heroes.ready, false);
  assert.equal(heroes.name(8), '#8');
  assert.equal(heroes.slug(8), '');
});

test('without a key there is nothing to ask, and nothing to poll', async () => {
  const keyless = new HeroCatalog('', () => {
    throw new Error('should not reach the network');
  });
  assert.equal(await keyless.load(), false);

  assert.throws(
    () =>
      createSource({ steamApiKey: '', leagueId: 0, matchId: '', timeoutMs: 1000 }, false),
    new RegExp(MISSING_KEY.slice(0, 30)),
  );
});

test('the demo needs no key at all', () => {
  const demo = createSource(
    { steamApiKey: '', leagueId: 0, matchId: '', timeoutMs: 1000 },
    true,
  );
  assert.match(demo.label, /demo/);
});
