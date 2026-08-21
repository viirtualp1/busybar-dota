import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements } from '../src/bar/elements';
import { BACK } from '../src/bar/layout';
import { HeroCatalog } from '../src/dota/heroes';
import {
  PORTRAIT_SIZE,
  PortraitStore,
  portraitPath,
  toPortrait,
} from '../src/dota/portraits';
import { emptyTeam, idleSnapshot, type MatchSnapshot } from '../src/dota/types';
import { Bitmap, decodePng } from '../src/preview/png';
import { buildFrame } from '../src/view/frame';
import { frameOptions } from './helpers';

const RADIANT_PICKS = [8, 74, 5, 26, 87];
const DIRE_PICKS = [11, 41, 19, 31, 86];
const RADIANT_BANS = [1, 14, 47, 63, 81, 90, 114];
const DIRE_BANS = [6, 21, 44, 53, 79, 92, 123];

function drafted(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: 'm1',
    gameTimeSec: -5,
    radiant: {
      ...emptyTeam('Team Spirit', 'TS'),
      draft: { picks: RADIANT_PICKS, bans: RADIANT_BANS },
    },
    dire: {
      ...emptyTeam('Falcons', 'FLC'),
      draft: { picks: DIRE_PICKS, bans: DIRE_BANS },
    },
    ...overrides,
  };
}

const allReady = new Set([...RADIANT_BANS, ...DIRE_BANS]);

test('a finished draft turns the bans into a grid of portraits', () => {
  const frame = buildFrame(drafted(), frameOptions({ portraits: allReady }));
  assert.deepEqual(frame.banGrid, { radiant: RADIANT_BANS, dire: DIRE_BANS });

  const images = backElements(frame).filter((element) => element.type === 'image');
  assert.equal(images.length, RADIANT_BANS.length + DIRE_BANS.length);
  assert.equal(
    images[0]?.type === 'image' && 'path' in images[0] && images[0].path,
    portraitPath(1),
  );

  // Two rows, seven a side, inside the panel.
  const rows = new Set(images.map((image) => image.y));
  assert.equal(rows.size, 2);
  for (const image of images) {
    assert.ok(image.x + PORTRAIT_SIZE <= BACK.width, `a portrait runs to ${image.x}px`);
    assert.ok(image.y + PORTRAIT_SIZE <= BACK.height, `a row runs to ${image.y}px`);
  }
});

test('the picks stay on screen until the last one lands', () => {
  const midDraft = drafted({
    dire: { ...emptyTeam('Falcons', 'FLC'), draft: { picks: [11, 41], bans: DIRE_BANS } },
  });
  const frame = buildFrame(midDraft, frameOptions({ portraits: allReady }));

  assert.equal(frame.banGrid, null);
  assert.equal(
    backElements(frame).some((element) => element.type === 'image'),
    false,
  );
});

test('a portrait that never arrived leaves the text bans alone', () => {
  const short = new Set([...allReady].slice(0, 5));
  const frame = buildFrame(drafted(), frameOptions({ portraits: short }));

  assert.equal(frame.banGrid, null);
  assert.match(frame.backSub, /^BANS 7-7/);
});

test('the divider is dropped under the grid, since there are no columns', () => {
  const grid = buildFrame(drafted(), frameOptions({ portraits: allReady }));
  const text = buildFrame(drafted(), frameOptions());

  assert.equal(grid.showDivider, false);
  assert.equal(text.showDivider, true);
});

test('a live game never shows the grid, however many bans it remembers', () => {
  const running = drafted({ gameTimeSec: 300 });
  const frame = buildFrame(running, frameOptions({ portraits: allReady }));

  assert.equal(frame.mode, 'live');
  assert.equal(frame.banGrid, null);
});

test('icons are flattened to a square of greys the panel can draw', () => {
  const source = new Bitmap(32, 32, { r: 0, g: 0, b: 0, a: 255 });
  source.fillRect(8, 8, 16, 16, { r: 90, g: 90, b: 90, a: 255 });

  const portrait = toPortrait(source, 16);
  assert.equal(portrait.width, 16);
  assert.equal(portrait.height, 16);

  const round = decodePng(portrait.toPng());
  assert.equal(round.width, 16);
  // The brightest patch is stretched to white, the empty border stays black.
  assert.equal(round.data[(8 * 16 + 8) * 4], 255);
  assert.equal(round.data[0], 0);
});

test('a hero the catalogue does not know is skipped, not retried forever', async () => {
  let calls = 0;
  const store = new PortraitStore(
    new HeroCatalog(),
    () => Promise.resolve(),
    () => {
      calls += 1;
      return Promise.resolve(new Response('', { status: 404 }));
    },
  );

  // The first pass says what went wrong; the second has nothing left to try.
  await assert.rejects(store.prepare([9999]), /no icon name for hero 9999/);
  await store.prepare([9999]);

  assert.equal(store.ready.size, 0);
  // No slug for an unknown hero, so it never even reaches the network.
  assert.equal(calls, 0);
});
