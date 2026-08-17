/**
 * Fitting a sentence into seventeen glyphs.
 *
 * The front display is 72px wide and redraws about five times a second. That
 * rate is the whole problem with scrolling: a step small enough to look smooth
 * (one pixel) crawls at 5px/s, and a step fast enough to finish a sentence
 * jumps a whole 4px glyph at a time, which reads as a stutter rather than
 * motion. Worse, the old 180ms step against a 200ms redraw was not a whole
 * multiple, so steps landed on alternating frames and visibly jittered.
 *
 * So the default is `page`: break on word boundaries and hold each page still
 * long enough to read. Nothing moves, so nothing can stutter. `scroll` is kept
 * for when a moving line is what you want, with its step aligned to the redraw.
 */

export type TickerStyle = 'page' | 'scroll';

/** Blank columns between the end of a scrolling line and its repeat. */
const GAP = '   ';

/** How long each page holds. Comfortably longer than a glance. */
export const PAGE_MS = 2200;

/** The head of a scrolling line holds still first, or you miss the beginning. */
export const HOLD_MS = 1200;

/**
 * One glyph per step, and a whole number of redraws per step.
 *
 * Two frames at the default 200ms cadence: 2.5 glyphs a second, which is a
 * readable pace, and every step lands on a frame boundary.
 */
export const STEP_MS = 400;

export type TickerOptions = {
  holdMs?: number;
  stepMs?: number;
  pageMs?: number;
};

/**
 * Splits `text` into chunks of at most `maxChars`, breaking between words.
 *
 * A word longer than the line is split rather than dropped — better an awkward
 * break than a missing word.
 */
export function paginate(text: string, maxChars: number): string[] {
  if (maxChars <= 0) {
    return [];
  }
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const pages: string[] = [];
  let line = '';
  const words = joinNumbers(trimmed.split(/\s+/));

  const flush = (): void => {
    if (line) {
      pages.push(line);
      line = '';
    }
  };

  for (const word of words) {
    let rest = word;
    while (rest.length > maxChars) {
      flush();
      pages.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    if (!rest) {
      continue;
    }
    if (!line) {
      line = rest;
    } else if (line.length + 1 + rest.length <= maxChars) {
      line = `${line} ${rest}`;
    } else {
      flush();
      line = rest;
    }
  }
  flush();
  return pages.length > 0 ? pages : [''];
}

/**
 * Glues a bare number onto the word before it, so `tier 2` and `Game 1:` are
 * never split across pages. Reading `mid tier` then `2 tower` is worse than a
 * slightly shorter line.
 */
function joinNumbers(words: string[]): string[] {
  const joined: string[] = [];
  for (const word of words) {
    const previous = joined.at(-1);
    if (previous !== undefined && /^\d+[.,:;]?$/.test(word)) {
      joined[joined.length - 1] = `${previous} ${word}`;
      continue;
    }
    joined.push(word);
  }
  return joined;
}

/** The page visible at `elapsedMs`, cycling forever. */
export function pageAt(
  text: string,
  maxChars: number,
  elapsedMs: number,
  options: TickerOptions = {},
): string {
  const pages = paginate(text, maxChars);
  if (pages.length <= 1) {
    return pages[0] ?? '';
  }
  const pageMs = options.pageMs ?? PAGE_MS;
  const index = Math.floor(Math.max(0, elapsedMs) / pageMs) % pages.length;
  return pages[index] ?? '';
}

/**
 * The window of `text` visible at `elapsedMs`, scrolling.
 *
 * Text that fits is returned untouched and never moves — a line that scrolls
 * when it did not need to is worse than one that sits still.
 */
export function scrollAt(
  text: string,
  maxChars: number,
  elapsedMs: number,
  options: TickerOptions = {},
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

export function tickerLine(
  style: TickerStyle,
  text: string,
  maxChars: number,
  elapsedMs: number,
  options: TickerOptions = {},
): string {
  return style === 'scroll'
    ? scrollAt(text, maxChars, elapsedMs, options)
    : pageAt(text, maxChars, elapsedMs, options);
}

/**
 * The same, for lines with no start event of their own.
 *
 * The waiting screen's line has been there since the app booted; measuring from
 * the epoch would park it on an arbitrary page forever. This restarts the cycle
 * so the sentence is always seen from its beginning.
 */
export function tickerLineLooping(
  style: TickerStyle,
  text: string,
  maxChars: number,
  nowMs: number,
  options: TickerOptions = {},
): string {
  if (text.length <= maxChars) {
    return text;
  }
  const cycleMs =
    style === 'scroll'
      ? (options.holdMs ?? HOLD_MS) +
        (text.length + GAP.length) * (options.stepMs ?? STEP_MS)
      : paginate(text, maxChars).length * (options.pageMs ?? PAGE_MS);
  return tickerLine(style, text, maxChars, nowMs % cycleMs, options);
}

/** How many glyphs of a given font fit in `widthPx`. */
export function fittingChars(widthPx: number, glyphWidth: number): number {
  return Math.max(0, Math.floor(widthPx / glyphWidth));
}
