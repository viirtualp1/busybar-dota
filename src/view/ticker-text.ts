export type TickerStyle = 'page' | 'scroll';

const GAP = '   ';

export const PAGE_MS = 2200;

export const HOLD_MS = 1200;

export const STEP_MS = 400;

export type TickerOptions = {
  holdMs?: number;
  stepMs?: number;
  pageMs?: number;
};

export function paginate(text: string, maxChars: number) {
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

  const flush = () => {
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

function joinNumbers(words: string[]) {
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

export function pageAt(
  text: string,
  maxChars: number,
  elapsedMs: number,
  options: TickerOptions = {},
) {
  const pages = paginate(text, maxChars);
  if (pages.length <= 1) {
    return pages[0] ?? '';
  }
  const pageMs = options.pageMs ?? PAGE_MS;
  const index = Math.floor(Math.max(0, elapsedMs) / pageMs) % pages.length;

  return pages[index] ?? '';
}

export function scrollAt(
  text: string,
  maxChars: number,
  elapsedMs: number,
  options: TickerOptions = {},
) {
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

  // Wrap by reading past the end of a doubled string rather than stitching slices.
  return (loop + loop).slice(offset, offset + maxChars);
}

export function tickerLine(
  style: TickerStyle,
  text: string,
  maxChars: number,
  elapsedMs: number,
  options: TickerOptions = {},
) {
  return style === 'scroll'
    ? scrollAt(text, maxChars, elapsedMs, options)
    : pageAt(text, maxChars, elapsedMs, options);
}

export function tickerLineLooping(
  style: TickerStyle,
  text: string,
  maxChars: number,
  nowMs: number,
  options: TickerOptions = {},
) {
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

export function fittingChars(widthPx: number, glyphWidth: number) {
  return Math.max(0, Math.floor(widthPx / glyphWidth));
}
