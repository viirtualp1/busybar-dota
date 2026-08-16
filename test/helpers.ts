import { BACK } from '../src/bar/layout.js';
import { HeroCatalog } from '../src/dota/heroes.js';
import type { Schedule } from '../src/dota/schedule/index.js';
import type { BackCell, BackRow, FrameOptions } from '../src/view/frame.js';

export const heroes = new HeroCatalog();

export function frameOptions(overrides: Partial<FrameOptions> = {}): FrameOptions {
  return {
    heroes,
    maxRows: BACK.maxRows,
    flash: null,
    nowEpochMs: Date.UTC(2026, 7, 16, 6, 0, 0),
    schedule: null,
    idleNote: '',
    ...overrides,
  };
}

/** Narrows a row to the two-column shape, failing loudly if it is a bracket row. */
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
  return {
    next: {
      teamA: 'Team Spirit',
      teamB: 'Falcons',
      tagA: 'TS',
      tagB: 'FLC',
      startsAtMs: Date.UTC(2026, 7, 16, 8, 0, 0),
      stage: 'Upper Bracket R2',
      stageShort: 'UB2',
      bestOf: 3,
    },
    bracket: [
      { label: 'UB R1', text: 'Spirit 2-0 Tundra', next: false },
      { label: 'UB R2', text: 'Spirit vs Falcons', next: true },
      { label: 'LB R2', text: 'Tundra vs Liquid', next: false },
    ],
    ...overrides,
  };
}
