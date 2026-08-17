import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements, frontElements } from '../src/bar/elements.js';
import { BACK, FRONT } from '../src/bar/layout.js';
import { emptyTeam, idleSnapshot, type MatchSnapshot } from '../src/dota/types.js';
import { Bitmap, parseColor } from '../src/preview/png.js';
import { renderBack, renderFront } from '../src/preview/raster.js';
import { buildFrame } from '../src/view/frame.js';

import { frameOptions } from './helpers.js';

const options = frameOptions();

function snapshot(): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: 'm1',
    gameTimeSec: 600,
    radiant: { ...emptyTeam('Team Spirit', 'TS'), kills: 12, towers: 11 },
    dire: { ...emptyTeam('Falcons', 'FLC'), kills: 8, towers: 9 },
    netWorthLead: 8000,
  };
}

function pixel(bitmap: Bitmap, x: number, y: number) {
  const offset = (y * bitmap.width + x) * 4;
  return {
    r: bitmap.data[offset] ?? 0,
    g: bitmap.data[offset + 1] ?? 0,
    b: bitmap.data[offset + 2] ?? 0,
  };
}

test('colours parse with and without an alpha byte', () => {
  assert.deepEqual(parseColor('#FF8040FF'), { r: 255, g: 128, b: 64, a: 255 });
  assert.deepEqual(parseColor('#FF8040'), { r: 255, g: 128, b: 64, a: 255 });
  assert.equal(parseColor('#00000000').a, 0);
  assert.equal(parseColor('nonsense').a, 0);
});

test('the rendered displays are exactly device sized', () => {
  const frame = buildFrame(snapshot(), options);
  assert.equal(renderFront(frontElements(frame)).width, FRONT.width);
  assert.equal(renderFront(frontElements(frame)).height, FRONT.height);
  assert.equal(renderBack(backElements(frame)).width, BACK.width);
  assert.equal(renderBack(backElements(frame)).height, BACK.height);
});

test('the front keeps team colour, since it is an RGB panel', () => {
  const frame = buildFrame(snapshot(), options);
  const bitmap = renderFront(frontElements(frame));
  // Row 10 is the gap between the bold score above and the tiny row below, so
  // it samples the band itself rather than whatever text is sitting on it.
  const left = pixel(bitmap, 1, 10);
  const right = pixel(bitmap, FRONT.width - 2, 10);
  assert.ok(left.g > left.r, 'radiant band should be green-dominant');
  assert.ok(right.r > right.g, 'dire band should be red-dominant');
});

test('the back is flattened to grey, matching the real OLED', () => {
  const frame = buildFrame(snapshot(), options);
  const bitmap = renderBack(backElements(frame));
  for (let x = 0; x < bitmap.width; x += 7) {
    for (let y = 0; y < bitmap.height; y += 7) {
      const { r, g, b } = pixel(bitmap, x, y);
      assert.equal(r, g, `expected grey at ${x},${y}`);
      assert.equal(g, b, `expected grey at ${x},${y}`);
    }
  }
});

test('the encoder emits a real PNG signature and IEND', () => {
  const png = new Bitmap(4, 2).toPng();
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
});

test('scaling keeps pixels square and countable', () => {
  const bitmap = new Bitmap(2, 1, { r: 0, g: 0, b: 0, a: 255 });
  bitmap.set(1, 0, { r: 255, g: 255, b: 255, a: 255 });
  const scaled = bitmap.scale(4);
  assert.equal(scaled.width, 8);
  assert.equal(scaled.height, 4);
  assert.equal(pixel(scaled, 0, 0).r, 0);
  assert.equal(pixel(scaled, 7, 3).r, 255);
});
