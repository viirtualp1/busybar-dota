import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fittingChars,
  PAGE_MS,
  pageAt,
  paginate,
  scrollAt,
  STEP_MS,
  tickerLineLooping,
} from '../src/view/ticker-text';
import { DEFAULTS } from '../src/config';

const LINE = 17;

test('a line that fits is one page and never moves', () => {
  assert.deepEqual(paginate('TS kill — 6-3', LINE), ['TS kill — 6-3']);
  assert.equal(pageAt('TS kill — 6-3', LINE, 99_999), 'TS kill — 6-3');
  assert.equal(scrollAt('TS kill — 6-3', LINE, 99_999), 'TS kill — 6-3');
});

test('pages break between words, never mid-word', () => {
  const pages = paginate('FLC lost mid melee and mid ranged barracks', LINE);
  assert.ok(pages.every((page) => page.length <= LINE));

  assert.equal(pages.join(' '), 'FLC lost mid melee and mid ranged barracks');
});

test('a number is never orphaned from the word before it', () => {
  const pages = paginate('FLC lost mid tier 2 tower', LINE);
  assert.ok(
    pages.every((page) => !/^\d/.test(page)),
    `no page should start with a bare number, got ${JSON.stringify(pages)}`,
  );
});

test('a word longer than the line is split rather than dropped', () => {
  const pages = paginate('Supercalifragilistic tower', 10);
  assert.ok(pages.every((page) => page.length <= 10));
  assert.equal(pages.join('').replace(/\s/g, ''), 'Supercalifragilistictower');
});

test('pages advance on a fixed beat and then repeat', () => {
  const text = 'Roshan killed, respawns in 9 min';
  const pages = paginate(text, LINE);
  assert.ok(pages.length > 1);
  assert.equal(pageAt(text, LINE, 0), pages[0]);
  assert.equal(pageAt(text, LINE, PAGE_MS), pages[1]);
  assert.equal(pageAt(text, LINE, PAGE_MS * pages.length), pages[0]);
});

test('the scroll step is a whole number of redraws', () => {
  assert.equal(STEP_MS % DEFAULTS.frameMs, 0);
  assert.ok(STEP_MS / DEFAULTS.frameMs >= 2, 'at least two frames per glyph');
});

test('scrolling holds the head still before it moves', () => {
  const text = 'FLC lost mid melee and mid ranged barracks';
  assert.equal(scrollAt(text, LINE, 0), text.slice(0, LINE));
  assert.equal(scrollAt(text, LINE, 500), text.slice(0, LINE));
});

test('a looping line always starts from the beginning of the sentence', () => {
  const text = 'Team Spirit vs Falcons';
  assert.match(tickerLineLooping('page', text, LINE, 0), /^Team Spirit/);
  assert.match(tickerLineLooping('scroll', text, LINE, 0), /^Team Spirit/);
});

test('character budgets come from the panel width, not a guess', () => {
  assert.equal(fittingChars(70, 4), 17);
  assert.equal(fittingChars(3, 4), 0);
});
