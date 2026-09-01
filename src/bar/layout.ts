import { BACK as DEVICE_BACK, FRONT as DEVICE_FRONT } from 'busybar-kit/device';
import { fillWidth } from 'busybar-kit/elements';

export { clipToWidth, FONT_WIDTH, rowY, type BarFont } from 'busybar-kit/device';
export { MIN_FILL } from 'busybar-kit/elements';

export const FRONT = {
  ...DEVICE_FRONT,
  scoreY: 0,
  bottomY: 11,
  finalRowY: 3,
  clockWidth: 30,
  seriesWidth: 26,
} as const;

export const BACK = {
  ...DEVICE_BACK,
  heroWidth: 40,
  statsOffset: 42,
  statsWidth: 34,
  bracketLabelWidth: 20,
  bracketTextX: 22,
  bracketTextWidth: 134,
} as const;

export const LEAD_CAP = 25_000;

export function radiantFillWidth(netWorthLead: number, width = FRONT.width) {
  const clamped = Math.max(-LEAD_CAP, Math.min(LEAD_CAP, netWorthLead));

  return fillWidth((clamped / LEAD_CAP + 1) / 2, width);
}
