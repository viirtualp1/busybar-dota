export const FRONT = {
  width: 72,
  height: 16,
  /** Bold score sits on the top band, same as the LiveSplit timer. */
  scoreY: 0,
  /** Tiny bottom row: clock on the left, series on the right. */
  bottomY: 11,
  clockWidth: 30,
  seriesWidth: 26,
} as const;

const BACK_HEIGHT = 80;
const BACK_FIRST_ROW_Y = 18;
const BACK_ROW_HEIGHT = 12;

export const BACK = {
  width: 160,
  height: BACK_HEIGHT,
  headerY: 2,
  subHeaderY: 9,
  firstRowY: BACK_FIRST_ROW_Y,
  rowHeight: BACK_ROW_HEIGHT,
  maxRows: Math.floor((BACK_HEIGHT - BACK_FIRST_ROW_Y) / BACK_ROW_HEIGHT),
  /** Two side-by-side columns: Radiant on the left, Dire on the right. */
  leftX: 2,
  rightX: 82,
  columnWidth: 76,
  /** Within a column: hero name, then the stat block right-aligned. */
  heroWidth: 40,
  statsOffset: 42,
  statsWidth: 34,
  /** Bracket rows run the full width instead: a short round label, then the tie. */
  bracketLabelWidth: 28,
  bracketTextX: 32,
  bracketTextWidth: 124,
} as const;

export type BarFont = 'tiny' | 'small' | 'bold';

/** Upper bound per glyph; device fonts may be narrower, so clipping is conservative. */
export const FONT_WIDTH: Record<BarFont, number> = {
  tiny: 4,
  small: 4,
  bold: 8,
};

export function clipToWidth(text: string, widthPx: number, font: BarFont): string {
  const maxChars = Math.max(1, Math.floor(widthPx / FONT_WIDTH[font]));
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 2) {
    return text.slice(0, maxChars);
  }
  return `${text.slice(0, maxChars - 1)}.`;
}

export function rowY(index: number): number {
  return BACK.firstRowY + index * BACK.rowHeight;
}

/**
 * Splits the 72px front display between the two teams by net worth.
 *
 * Capped at a 25k lead: past that the game is over and a fully-filled bar stops
 * carrying information, while a clamp keeps both colours on screen so the
 * display still reads as a match rather than a solid block.
 */
export const LEAD_CAP = 25_000;
export const MIN_FILL = 6;

export function radiantFillWidth(netWorthLead: number, width = FRONT.width): number {
  const clamped = Math.max(-LEAD_CAP, Math.min(LEAD_CAP, netWorthLead));
  const share = (clamped / LEAD_CAP + 1) / 2;
  const raw = Math.round(share * width);
  return Math.max(MIN_FILL, Math.min(width - MIN_FILL, raw));
}
