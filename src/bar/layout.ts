export const FRONT = {
  width: 72,
  height: 16,
  scoreY: 0,
  bottomY: 11,
  finalRowY: 3,
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
  leftX: 2,
  rightX: 82,
  columnWidth: 76,
  heroWidth: 40,
  statsOffset: 42,
  statsWidth: 34,
  bracketLabelWidth: 20,
  bracketTextX: 22,
  bracketTextWidth: 134,
  bansPerRow: 7,
  banLeftX: 8,
  banGap: 5,
  banTopY: 26,
  banRowStep: 26,
} as const;

export type BarFont = 'tiny' | 'small' | 'bold';

export const FONT_WIDTH: Record<BarFont, number> = {
  tiny: 4,
  small: 4,
  bold: 8,
};

export function clipToWidth(text: string, widthPx: number, font: BarFont) {
  const maxChars = Math.max(1, Math.floor(widthPx / FONT_WIDTH[font]));
  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= 2) {
    return text.slice(0, maxChars);
  }

  return `${text.slice(0, maxChars - 1)}.`;
}

export function rowY(index: number) {
  return BACK.firstRowY + index * BACK.rowHeight;
}

export const LEAD_CAP = 25_000;
export const MIN_FILL = 6;

export function radiantFillWidth(netWorthLead: number, width = FRONT.width) {
  const clamped = Math.max(-LEAD_CAP, Math.min(LEAD_CAP, netWorthLead));
  const share = (clamped / LEAD_CAP + 1) / 2;
  const raw = Math.round(share * width);

  return Math.max(MIN_FILL, Math.min(width - MIN_FILL, raw));
}
