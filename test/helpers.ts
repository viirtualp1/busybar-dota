import { BACK } from '../src/bar/layout';
import { HeroCatalog } from '../src/dota/heroes';
import type { Schedule } from '../src/dota/schedule/index';
import {
  FRONT_LINE_CHARS,
  type BackCell,
  type BackRow,
  type FrameOptions,
} from '../src/view/frame';

export const heroes = new HeroCatalog();

export function frameOptions(overrides: Partial<FrameOptions> = {}): FrameOptions {
  return {
    heroes,
    maxRows: BACK.maxRows,
    ticker: null,
    nowEpochMs: Date.UTC(2026, 7, 16, 6, 0, 0),
    schedule: null,
    seriesBreak: null,
    idleNote: '',
    tickerStyle: 'page',
    tickerChars: FRONT_LINE_CHARS,
    portraits: new Set<number>(),
    leagueName: '',
    ...overrides,
  };
}

export function pairOf(row: BackRow | undefined): {
  left: BackCell | null;
  right: BackCell | null;
} {
  if (!row || row.kind !== 'pair') {
    throw new Error(`expected a paired row, got ${row?.kind ?? 'nothing'}`);
  }

  return { left: row.left, right: row.right };
}

export function wideOf(row: BackRow | undefined): {
  label: string;
  text: string;
  highlight: boolean;
} {
  if (!row || row.kind !== 'wide') {
    throw new Error(`expected a bracket row, got ${row?.kind ?? 'nothing'}`);
  }

  return { label: row.label, text: row.text, highlight: row.highlight };
}

export function schedule(overrides: Partial<Schedule> = {}): Schedule {
  const next = {
    teamA: 'Team Spirit',
    teamB: 'Falcons',
    tagA: 'TS',
    tagB: 'FLC',
    startsAtMs: Date.UTC(2026, 7, 16, 8, 0, 0),
    stage: 'Upper Bracket R2',
    stageShort: 'UB2',
    bestOf: 3,
  };
  const later = {
    teamA: 'Tundra',
    teamB: 'Liquid',
    tagA: 'TUND',
    tagB: 'LIQ',
    startsAtMs: Date.UTC(2026, 7, 16, 10, 0, 0),
    stage: 'Lower Bracket R2',
    stageShort: 'LB2',
    bestOf: 3,
  };
  return {
    next,
    upcoming: [next, later],
    bracket: [
      { label: 'UB R1', text: 'Spirit 2-0 Tundra', next: false },
      { label: 'UB R2', text: 'Spirit vs Falcons', next: true },
      { label: 'LB R2', text: 'Tundra vs Liquid', next: false },
    ],
    ...overrides,
  };
}
