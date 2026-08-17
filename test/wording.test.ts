import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backElements, frontElements } from '../src/bar/elements.js';
import { FONT_WIDTH, FRONT } from '../src/bar/layout.js';
import { detectEvent, EVENT_TEXT, stateOf } from '../src/domain/events.js';
import { resultText, type SeriesBreak } from '../src/domain/series.js';
import { emptyTeam, idleSnapshot, type MatchSnapshot } from '../src/dota/types.js';
import { buildFrame } from '../src/view/frame.js';
import { frameOptions, schedule } from './helpers.js';

const ALL_TOWERS = 0b111_1111_1111;
const ALL_BARRACKS = 0b11_1111;

/**
 * The Bar draws a placeholder box for glyphs its font lacks, so an em dash
 * arrives as a stray rectangle sitting in the middle of a sentence.
 */
function assertAscii(text: string, where: string): void {
  const stray = [...text].filter((character) => character.charCodeAt(0) > 126);
  assert.deepEqual(stray, [], `${where} has non-ASCII: ${JSON.stringify(text)}`);
}

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...idleSnapshot(),
    live: true,
    matchId: 'm1',
    seriesType: 1,
    radiant: {
      ...emptyTeam('Team Spirit', 'TS'),
      kills: 5,
      towers: 11,
      towerState: ALL_TOWERS,
      barracksState: ALL_BARRACKS,
    },
    dire: {
      ...emptyTeam('Falcons', 'FLC'),
      kills: 3,
      towers: 11,
      towerState: ALL_TOWERS,
      barracksState: ALL_BARRACKS,
    },
    roshanRespawnSec: 0,
    ...overrides,
  };
}

function seriesBreak(overrides: Partial<SeriesBreak> = {}): SeriesBreak {
  return {
    radiantName: 'Team Spirit',
    direName: 'Falcons',
    radiantTag: 'TS',
    direTag: 'FLC',
    radiantWins: 1,
    direWins: 0,
    nextGame: 2,
    winsNeeded: 2,
    lastMatchId: 'm1',
    pendingResult: false,
    lastWinner: 'radiant',
    startedAtMs: 0,
    ...overrides,
  };
}

test('every event sentence is plain ASCII', () => {
  const base = snapshot();
  const before = stateOf(base);
  const cases: [string, MatchSnapshot][] = [
    ['tower', { ...base, dire: { ...base.dire, towerState: ALL_TOWERS & ~(1 << 4) } }],
    [
      'barracks',
      { ...base, dire: { ...base.dire, barracksState: ALL_BARRACKS & ~(1 << 2) } },
    ],
    ['roshan', snapshot({ roshanRespawnSec: 540 })],
    ['kill', { ...base, radiant: { ...base.radiant, kills: 6 } }],
    ['match-end', { ...base, live: false }],
  ];

  for (const [name, next] of cases) {
    const { event } = detectEvent(before, next);
    assert.ok(event, `${name} produced no event`);
    assertAscii(event.text, name);
  }
  assertAscii(EVENT_TEXT.matchStart('Team Spirit', 'Falcons'), 'match-start');
  assertAscii(resultText(seriesBreak()), 'result');
  assertAscii(resultText(seriesBreak({ pendingResult: true, lastWinner: null })), 'pending');
});

test('every line drawn on either display is plain ASCII', () => {
  const frames = [
    buildFrame(snapshot(), frameOptions()),
    buildFrame(idleSnapshot(), frameOptions({ schedule: schedule() })),
    buildFrame(idleSnapshot(), frameOptions({ seriesBreak: seriesBreak(), nowEpochMs: 0 })),
  ];
  for (const frame of frames) {
    for (const element of [...frontElements(frame), ...backElements(frame)]) {
      if (element.type === 'text') {
        assertAscii(element.text ?? '', `${frame.mode}/${element.id}`);
      }
    }
  }
});

test('the gold lead shows bottom-right, coloured by side', () => {
  const ahead = buildFrame(snapshot({ netWorthLead: 9600 }), frameOptions());
  assert.equal(ahead.leadText, '+9.6k');
  assert.equal(ahead.leadSide, 'radiant');

  const behind = buildFrame(snapshot({ netWorthLead: -4200 }), frameOptions());
  assert.equal(behind.leadText, '+4.2k');
  assert.equal(behind.leadSide, 'dire');
});

test('the lead never grows wide enough to reach the centred series score', () => {
  // Right-aligned at the edge; the series score sits centred at 30..42px.
  const huge = buildFrame(snapshot({ netWorthLead: 99_900 }), frameOptions());
  const widthPx = huge.leadText.length * FONT_WIDTH.tiny;
  assert.ok(
    FRONT.width - widthPx > 44,
    `lead "${huge.leadText}" is ${widthPx}px and would overlap the series score`,
  );
});

test('a lead too small to matter is left off rather than flickering', () => {
  const level = buildFrame(snapshot({ netWorthLead: 200 }), frameOptions());
  assert.equal(level.leadText, '');
  assert.equal(level.leadSide, null);
});

test('the result screen boxes the winner and drops the event line', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({ seriesBreak: seriesBreak(), nowEpochMs: 0 }),
  );
  assert.equal(frame.mode, 'result');
  assert.deepEqual(frame.finalTags, { radiant: 'TS', dire: 'FLC', winner: 'radiant' });
  assert.equal(frame.seriesText, '1-0');
  // No ticker on the result screen: the names and the score are the message.
  assert.equal(frame.tickerText, '');

  const boxes = frontElements(frame).filter((element) =>
    element.id.startsWith('final-box'),
  );
  assert.equal(boxes.length, 2);
  const bordered = boxes.filter(
    (element) => element.type === 'rectangle' && (element.border_width ?? 0) > 0,
  );
  assert.equal(bordered.length, 1, 'exactly one team is boxed');
  assert.equal(bordered[0]?.id, 'final-box-radiant');
});

test('a pending result boxes nobody rather than guessing', () => {
  const frame = buildFrame(
    idleSnapshot(),
    frameOptions({
      seriesBreak: seriesBreak({ pendingResult: true, lastWinner: null }),
      nowEpochMs: 0,
    }),
  );
  assert.equal(frame.finalTags?.winner, null);
  assert.equal(frame.seriesText, '');
  const bordered = frontElements(frame).filter(
    (element) =>
      element.id.startsWith('final-box') &&
      element.type === 'rectangle' &&
      (element.border_width ?? 0) > 0,
  );
  assert.equal(bordered.length, 0);
});
