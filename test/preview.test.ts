import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements, frontElements } from '../src/bar/elements';
import { BACK, FRONT } from '../src/bar/layout';
import { emptyTeam, idleSnapshot, type MatchSnapshot } from '../src/dota/types';
import { type Bitmap, renderBack, renderFront } from 'busybar-kit/preview';
import { buildFrame } from '../src/view/frame';

import { frameOptions } from './helpers';

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

// The encoder, the colour parser and scaling are busybar-kit's own tests.
// What matters here is that this app's frames land on the panel correctly.

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
