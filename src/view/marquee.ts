/**
 * Scrolling text for lines that do not fit.
 *
 * The front display is seventeen tiny glyphs wide, which is not enough for
 * "Falcons lost mid barracks". Clipping turned that into "FAL MID RAX" and lost
 * the sentence; scrolling keeps every word and costs only time.
 */

/** Blank columns between the end of the text and its repeat, so the loop reads. */
const GAP = '   ';

/** The head of the line holds still first, or you never catch the beginning. */
export const HOLD_MS = 900;

/** One glyph per step. Slow enough to read, fast enough to finish a sentence. */
export const STEP_MS = 180;

export type MarqueeOptions = {
  holdMs?: number;
  stepMs?: number;
};

/**
 * Returns the window of `text` visible at `elapsedMs`.
 *
 * Text that fits is returned untouched and never moves — a line that scrolls
 * when it did not need to is worse than one that sits still.
 */
export function marquee(
  text: string,
  maxChars: number,
  elapsedMs: number,
  options: MarqueeOptions = {},
): string {
  if (maxChars <= 0) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }

  const holdMs = options.holdMs ?? HOLD_MS;
  const stepMs = options.stepMs ?? STEP_MS;
  const moving = Math.max(0, elapsedMs - holdMs);
  const loop = text + GAP;
  const offset = Math.floor(moving / stepMs) % loop.length;

  // Wrap by reading past the end of a doubled string rather than stitching
  // slices together at every call site.
  return (loop + loop).slice(offset, offset + maxChars);
}

/**
 * A marquee for lines with no start event of their own.
 *
 * The waiting screen's line has been there since the app booted; measuring from
 * the epoch would leave it parked mid-word forever. This restarts from the head
 * every cycle so the sentence is always readable from its beginning.
 */
export function marqueeLoop(
  text: string,
  maxChars: number,
  nowMs: number,
  options: MarqueeOptions = {},
): string {
  if (text.length <= maxChars) {
    return text;
  }
  const holdMs = options.holdMs ?? HOLD_MS;
  const stepMs = options.stepMs ?? STEP_MS;
  const cycleMs = holdMs + (text.length + GAP.length) * stepMs;
  return marquee(text, maxChars, nowMs % cycleMs, options);
}

/** How many glyphs of a given font fit in `widthPx`. */
export function fittingChars(widthPx: number, glyphWidth: number): number {
  return Math.max(0, Math.floor(widthPx / glyphWidth));
}
