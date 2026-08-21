import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FONT_WIDTH, FRONT } from '../src/bar/layout';
import { LeagueCatalog, shortLeagueName } from '../src/dota/leagues';
import { idleSnapshot } from '../src/dota/types';
import { BOLD_LINE_CHARS, buildFrame, IDLE_TITLE } from '../src/view/frame';
import { frameOptions } from './helpers';

const TI = 'The International 2026';

function idle(leagueName: string) {
  return buildFrame(idleSnapshot(), frameOptions({ leagueName, idleNote: 'waiting' }));
}

test('with no league to name, the idle screen is unchanged', () => {
  const frame = idle('');
  assert.equal(frame.mode, 'idle');
  assert.equal(frame.scoreText, IDLE_TITLE);
  assert.equal(frame.tickerText, '');
  assert.equal(frame.backHeader, 'No live match');
});

test('a known league takes over the idle screen', () => {
  const frame = idle(TI);
  assert.equal(frame.scoreText, 'TI 2026');
  assert.equal(frame.backHeader, TI);
  assert.equal(frame.backSub, 'waiting');
});

test('the big row only ever holds what the bold font fits', () => {
  assert.equal(BOLD_LINE_CHARS, Math.floor(FRONT.width / FONT_WIDTH.bold));
  for (const name of [
    TI,
    'ESL One Birmingham 2026',
    'PGL Wallachia Season 5',
    'Riyadh',
  ]) {
    assert.ok(
      shortLeagueName(name, BOLD_LINE_CHARS).length <= BOLD_LINE_CHARS,
      `${name} does not fit`,
    );
  }
});

test('a short league name is left alone rather than initialled', () => {
  assert.equal(shortLeagueName('Riyadh', BOLD_LINE_CHARS), 'Riyadh');
  assert.equal(shortLeagueName('ESL One Birmingham 2026', BOLD_LINE_CHARS), 'EOB 2026');
  assert.equal(shortLeagueName('DreamLeague Season 26', BOLD_LINE_CHARS), 'DS 26');
  assert.equal(shortLeagueName('', BOLD_LINE_CHARS), '');
});

test('the bottom row spells the name out when it fits, and stays empty when it does not', () => {
  const roomy = buildFrame(
    idleSnapshot(),
    frameOptions({ leagueName: 'Riyadh Masters', tickerChars: 17 }),
  );
  const tight = buildFrame(
    idleSnapshot(),
    frameOptions({ leagueName: TI, tickerChars: 17 }),
  );

  assert.equal(roomy.tickerText, 'Riyadh Masters');
  assert.equal(tight.tickerText, '');
  assert.equal(tight.scoreText, 'TI 2026');
});

test('the league name is read from OpenDota and asked for once', async () => {
  let calls = 0;
  const catalog = new LeagueCatalog((url: Parameters<typeof fetch>[0]) => {
    calls += 1;
    assert.ok(
      typeof url === 'string' && url.endsWith('/leagues/19719'),
      'asked for 19719',
    );

    return Promise.resolve(
      new Response(JSON.stringify({ leagueid: 19719, name: TI, tier: 'premium' })),
    );
  });

  assert.equal(await catalog.load(19719), true);
  assert.equal(catalog.name, TI);
  assert.equal(await catalog.load(19719), true);
  assert.equal(calls, 1);
});

test('a league nobody can name leaves the screen as it was', async () => {
  const missing = new LeagueCatalog(() =>
    Promise.resolve(new Response('', { status: 404 })),
  );
  assert.equal(await missing.load(1), false);
  assert.equal(missing.name, '');

  const offline = new LeagueCatalog(() => Promise.reject(new Error('no network')));
  assert.equal(await offline.load(1), false);
  assert.equal(idle(offline.name).scoreText, IDLE_TITLE);
});
