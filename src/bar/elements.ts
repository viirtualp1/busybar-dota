import type { RectangleElement, TextElement } from '@busy-app/busy-lib';
import { COLORS } from '../view/colors.js';
import type { DotaFrame } from '../view/frame.js';
import { BACK, clipToWidth, FRONT, rowY } from './layout.js';

/**
 * The front display *is* the net worth bar: the two team colours split the 72px
 * and the score is drawn on top. Rectangles come first so the text lands above
 * them — elements paint in array order.
 */
export function frontElements(frame: DotaFrame): Array<TextElement | RectangleElement> {
  const fill = frame.radiantFill;

  return [
    bandRect(
      'band-radiant',
      0,
      fill,
      frame.idle ? COLORS.transparent : COLORS.radiantFill,
    ),
    bandRect(
      'band-dire',
      fill,
      FRONT.width - fill,
      frame.idle ? COLORS.transparent : COLORS.direFill,
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
    {
      id: 'clock',
      type: 'text',
      text: clipToWidth(frame.clockText || ' ', FRONT.clockWidth, 'tiny'),
      font: 'tiny',
      color: frame.clockText ? COLORS.clock : COLORS.transparent,
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
      text: clipToWidth(frame.seriesText || ' ', FRONT.seriesWidth, 'tiny'),
      font: 'tiny',
      color: frame.seriesText ? COLORS.muted : COLORS.transparent,
      display: 'front',
      align: 'top_right',
      x: FRONT.width - 1,
      y: FRONT.bottomY,
      width: FRONT.seriesWidth,
      timeout: 0,
    },
  ];
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

export function backElements(frame: DotaFrame): TextElement[] {
  const elements: TextElement[] = [
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

  // Fixed element count keeps ids stable, so a shorter roster cannot leave
  // yesterday's heroes on screen.
  for (let index = 0; index < BACK.maxRows; index += 1) {
    const row = frame.backRows[index];
    const y = rowY(index);
    elements.push(
      ...columnElements(`r${index}`, BACK.leftX, y, row?.left ?? null, COLORS.radiant),
      ...columnElements(`d${index}`, BACK.rightX, y, row?.right ?? null, COLORS.dire),
    );
  }

  return elements;
}

function columnElements(
  id: string,
  x: number,
  y: number,
  cell: { hero: string; stats: string } | null,
  color: string,
): TextElement[] {
  return [
    {
      id: `${id}-hero`,
      type: 'text',
      text: cell ? clipToWidth(cell.hero, BACK.heroWidth, 'tiny') : ' ',
      font: 'tiny',
      color: cell ? color : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x,
      y,
      width: BACK.heroWidth,
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
