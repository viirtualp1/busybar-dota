import type { RectangleElement, TextElement } from '@busy-app/busy-lib';
import { COLORS } from '../view/colors.js';
import type { DotaFrame } from '../view/frame.js';
import { BACK, clipToWidth, FONT_WIDTH, FRONT, rowY } from './layout.js';

/**
 * The front display *is* the net worth bar: the two team colours split the 72px
 * and the score is drawn on top. Rectangles come first so the text lands above
 * them — elements paint in array order.
 */
export function frontElements(frame: DotaFrame): Array<TextElement | RectangleElement> {
  const fill = frame.radiantFill;
  // The result screen also puts text on the bottom row, but its series score
  // lives higher up and must not be hidden with the clock.
  const ticking = frame.tickerText.length > 0 && frame.finalTags === null;
  const bottomText = frame.tickerText;

  return [
    bandRect(
      'band-radiant',
      0,
      fill,
      frame.showBands ? COLORS.radiantFill : COLORS.transparent,
    ),
    bandRect(
      'band-dire',
      fill,
      FRONT.width - fill,
      frame.showBands ? COLORS.direFill : COLORS.transparent,
    ),
    {
      id: 'tag-radiant',
      type: 'text',
      text: frame.radiantTag || ' ',
      font: 'tiny',
      color: frame.radiantTag ? COLORS.radiant : COLORS.transparent,
      display: 'front',
      align: 'top_left',
      x: 1,
      y: FRONT.scoreY + 1,
      timeout: 0,
    },
    {
      id: 'tag-dire',
      type: 'text',
      text: frame.direTag || ' ',
      font: 'tiny',
      color: frame.direTag ? COLORS.dire : COLORS.transparent,
      display: 'front',
      align: 'top_right',
      x: FRONT.width - 1,
      y: FRONT.scoreY + 1,
      timeout: 0,
    },
    {
      id: 'score',
      type: 'text',
      text: frame.scoreText,
      font: 'bold',
      color: COLORS.white,
      display: 'front',
      align: 'top_mid',
      x: Math.floor(FRONT.width / 2),
      y: FRONT.scoreY,
      timeout: 0,
    },
    // An event takes the whole bottom row for a few seconds; the clock and the
    // series score step aside rather than fighting it for space.
    {
      id: 'clock',
      type: 'text',
      text: ticking ? ' ' : clipToWidth(frame.clockText || ' ', FRONT.clockWidth, 'tiny'),
      font: 'tiny',
      color: !ticking && frame.clockText ? COLORS.clock : COLORS.transparent,
      display: 'front',
      align: 'top_left',
      x: 1,
      y: FRONT.bottomY,
      width: FRONT.clockWidth,
      timeout: 0,
    },
    {
      id: 'series',
      type: 'text',
      text: ticking
        ? ' '
        : clipToWidth(frame.seriesText || ' ', FRONT.seriesWidth, 'tiny'),
      font: 'tiny',
      color: !ticking && frame.seriesText ? COLORS.muted : COLORS.transparent,
      display: 'front',
      // Centred directly under the kill score. No `width`: the bold score above
      // has none either and lands dead centre, while a width turns `x` into the
      // left edge of a box and pushes the text half a box to the right.
      align: 'top_mid',
      x: Math.floor(FRONT.width / 2),
      y: frame.finalTags ? FRONT.finalRowY : FRONT.bottomY,
      timeout: 0,
    },
    // Who is ahead on gold. Coloured by side, since the front is the one panel
    // where hue actually carries information.
    {
      id: 'lead',
      type: 'text',
      text: ticking || !frame.leadText ? ' ' : frame.leadText,
      font: 'tiny',
      color:
        !ticking && frame.leadText
          ? frame.leadSide === 'radiant'
            ? COLORS.radiant
            : COLORS.dire
          : COLORS.transparent,
      display: 'front',
      align: 'top_right',
      x: FRONT.width - 1,
      y: FRONT.bottomY,
      timeout: 0,
    },
    ...finalElements(frame),
    {
      id: 'ticker',
      type: 'text',
      text: bottomText ? clipToWidth(bottomText, FRONT.width - 2, 'tiny') : ' ',
      font: 'tiny',
      color: bottomText ? COLORS.ticker : COLORS.transparent,
      display: 'front',
      align: 'top_mid',
      x: Math.floor(FRONT.width / 2),
      y: FRONT.bottomY,
      timeout: 0,
    },
  ];
}

/**
 * The result screen: both tags in bold with a box around the winner.
 *
 * Fixed element count, like every other row here, so switching modes cannot
 * leave half a box behind.
 */
function finalElements(frame: DotaFrame): Array<TextElement | RectangleElement> {
  const final = frame.finalTags;
  const won = (side: 'radiant' | 'dire'): boolean => final?.winner === side;

  const radiantWidth = boxWidth(final?.radiant ?? '');
  const direWidth = boxWidth(final?.dire ?? '');

  return [
    boxRect('final-box-radiant', 0, radiantWidth, won('radiant') && final !== null),
    boxRect(
      'final-box-dire',
      FRONT.width - direWidth,
      direWidth,
      won('dire') && final !== null,
    ),
    finalTag('final-radiant', final?.radiant ?? '', 'top_left', 3, won('radiant')),
    finalTag(
      'final-dire',
      final?.dire ?? '',
      'top_right',
      FRONT.width - 3,
      won('dire'),
    ),
  ];
}

/** The box hugs its tag rather than sitting at a fixed width around a short one. */
function boxWidth(tag: string): number {
  const text = Math.max(1, tag.length) * FONT_WIDTH.bold;
  return Math.min(FRONT.width / 2 - 1, text + 6);
}

/**
 * Rows 0..10, leaving the bottom row for the next match.
 *
 * Filled rather than outlined: a 16px panel cannot hold a border, a bold tag
 * inside it and a line of text beneath without the border cutting through
 * glyphs. A solid block behind the winner marks it just as clearly and only
 * needs the rows the tag already occupies.
 */
const FINAL_BOX_HEIGHT = 11;

function boxRect(
  id: string,
  x: number,
  width: number,
  visible: boolean,
): RectangleElement {
  return {
    id,
    type: 'rectangle',
    display: 'front',
    align: 'top_left',
    x,
    y: 0,
    width,
    height: FINAL_BOX_HEIGHT,
    fill: 'solid',
    fill_colors: [visible ? COLORS.white : COLORS.transparent],
    border_width: 0,
    border_color: COLORS.transparent,
    timeout: 0,
  };
}

function finalTag(
  id: string,
  text: string,
  align: 'top_left' | 'top_right',
  x: number,
  winner: boolean,
): TextElement {
  return {
    id,
    type: 'text',
    text: text || ' ',
    font: 'bold',
    // Knocked out of the block for the winner; the loser recedes but stays
    // readable, because you want the pairing, not just the name.
    color: text ? (winner ? COLORS.panelDark : COLORS.dim) : COLORS.transparent,
    display: 'front',
    align,
    x,
    y: 0,
    timeout: 0,
  };
}

function bandRect(id: string, x: number, width: number, color: string): RectangleElement {
  return {
    id,
    type: 'rectangle',
    display: 'front',
    align: 'top_left',
    x,
    y: 0,
    width: Math.max(1, width),
    height: FRONT.height,
    fill: 'solid',
    fill_colors: [color],
    border_width: 0,
    border_color: COLORS.transparent,
    timeout: 0,
  };
}

export function backElements(frame: DotaFrame): Array<TextElement | RectangleElement> {
  const elements: Array<TextElement | RectangleElement> = [
    {
      id: 'back-header',
      type: 'text',
      text: clipToWidth(frame.backHeader, BACK.width - 4, 'small'),
      font: 'small',
      color: COLORS.white,
      display: 'back',
      align: 'top_left',
      x: BACK.leftX,
      y: BACK.headerY,
      timeout: 0,
    },
    {
      id: 'back-sub',
      type: 'text',
      text: clipToWidth(frame.backSub || ' ', BACK.width - 4, 'tiny'),
      font: 'tiny',
      color: frame.backSub ? COLORS.muted : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x: BACK.leftX,
      y: BACK.subHeaderY,
      timeout: 0,
    },
  ];

  // Hue is unavailable on a greyscale panel, so the two rosters are separated by
  // a rule rather than by colour.
  elements.push({
    id: 'column-divider',
    type: 'rectangle',
    display: 'back',
    align: 'top_left',
    x: BACK.rightX - 4,
    y: BACK.firstRowY - 3,
    width: 1,
    height: BACK.height - BACK.firstRowY + 2,
    fill: 'solid',
    fill_colors: [frame.showDivider ? COLORS.backDivider : COLORS.transparent],
    border_width: 0,
    border_color: COLORS.transparent,
    timeout: 0,
  });

  // Fixed element count keeps ids stable, so a shorter roster cannot leave
  // yesterday's heroes on screen.
  for (let index = 0; index < BACK.maxRows; index += 1) {
    const row = frame.backRows[index];
    const y = rowY(index);
    // Both layouts emit the same four ids per row, so switching between a
    // roster and a bracket cannot strand text from the previous mode.
    const pair =
      row?.kind === 'wide'
        ? {
            // A marker, not a brighter grey: on a 16-shade panel the two
            // brightest shades are indistinguishable at this size.
            left: { hero: `${row.highlight ? '>' : ' '}${row.label}`, stats: '' },
            right: { hero: row.text, stats: '' },
            // Rounds already played are context, so they recede.
            color: row.highlight ? COLORS.white : COLORS.dim,
          }
        : {
            left: row?.left ?? null,
            right: row?.right ?? null,
            color: COLORS.backText,
          };

    const wide = row?.kind === 'wide';
    elements.push(
      ...columnElements(
        `r${index}`,
        BACK.leftX,
        y,
        pair.left,
        wide ? BACK.bracketLabelWidth : BACK.heroWidth,
        pair.color,
      ),
      ...columnElements(
        `d${index}`,
        wide ? BACK.leftX + BACK.bracketTextX : BACK.rightX,
        y,
        pair.right,
        wide ? BACK.bracketTextWidth : BACK.heroWidth,
        pair.color,
      ),
    );
  }

  return elements;
}

function columnElements(
  id: string,
  x: number,
  y: number,
  cell: { hero: string; stats: string } | null,
  width: number,
  color: string,
): TextElement[] {
  return [
    {
      id: `${id}-hero`,
      type: 'text',
      text: cell ? clipToWidth(cell.hero, width, 'tiny') : ' ',
      font: 'tiny',
      color: cell ? color : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x,
      y,
      width,
      timeout: 0,
    },
    {
      id: `${id}-stats`,
      type: 'text',
      text: cell?.stats ? clipToWidth(cell.stats, BACK.statsWidth, 'tiny') : ' ',
      font: 'tiny',
      color: cell?.stats ? COLORS.dim : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x: x + BACK.statsOffset,
      y,
      width: BACK.statsWidth,
      timeout: 0,
    },
  ];
}
