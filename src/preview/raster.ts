/**
 * Rasterises the element list the device would receive.
 *
 * Takes the *same* array that goes over the wire, so a layout bug shows up here
 * exactly as it would on hardware — modulo glyph shapes, see `font.ts`.
 */
import type { RectangleElement, TextElement } from '@busy-app/busy-lib';
import { BACK, FRONT } from '../bar/layout.js';
import { GLYPH_HEIGHT, GLYPH_WIDTH, glyph, textWidth } from './font.js';
import { Bitmap, parseColor, type Rgba } from './png.js';

export type AnyElement = TextElement | RectangleElement;

const OFF_PIXEL: Rgba = { r: 10, g: 10, b: 12, a: 255 };

export function renderFront(elements: AnyElement[]): Bitmap {
  return render(elements, 'front', FRONT.width, FRONT.height, false);
}

export function renderBack(elements: AnyElement[]): Bitmap {
  return render(elements, 'back', BACK.width, BACK.height, true);
}

/** The back panel is a 16-shade grey OLED, so hue carries no information there. */
const BACK_SHADES = 16;

function render(
  elements: AnyElement[],
  display: 'front' | 'back',
  width: number,
  height: number,
  greyscale: boolean,
): Bitmap {
  // The unlit background goes through the same conversion as everything else,
  // or the back display comes out subtly blue.
  const bitmap = new Bitmap(width, height, shade(OFF_PIXEL, greyscale));
  // Elements paint in array order, exactly as the device composites them.
  for (const element of elements) {
    if (element.display !== display) {
      continue;
    }
    if (element.type === 'rectangle') {
      drawRectangle(bitmap, element, greyscale);
    } else if (element.type === 'text') {
      drawText(bitmap, element, greyscale);
    }
  }
  return bitmap;
}

/**
 * Collapses a colour the way the back panel does: to luminance, quantised to the
 * shades it actually has. Without this the preview happily shows red and green
 * text that arrives on hardware as two nearly identical greys.
 */
function toBackShade(color: Rgba): Rgba {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const step = 255 / (BACK_SHADES - 1);
  const value = Math.round(Math.round(luminance / step) * step);
  return { r: value, g: value, b: value, a: color.a };
}

function shade(color: Rgba, greyscale: boolean): Rgba {
  return greyscale ? toBackShade(color) : color;
}

function drawRectangle(
  bitmap: Bitmap,
  element: RectangleElement,
  greyscale: boolean,
): void {
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const { x, y } = anchor(element.align, element.x, element.y, width, height);

  if (element.fill !== 'none') {
    const fill = shade(parseColor(element.fill_colors?.[0] ?? '#00000000'), greyscale);
    bitmap.fillRect(x, y, width, height, fill);
  }

  // Border last, so it sits on top of its own fill.
  const borderWidth = element.border_width ?? 0;
  if (borderWidth <= 0) {
    return;
  }
  const border = shade(parseColor(element.border_color ?? '#00000000'), greyscale);
  for (let ring = 0; ring < borderWidth; ring += 1) {
    bitmap.fillRect(x + ring, y + ring, width - ring * 2, 1, border);
    bitmap.fillRect(x + ring, y + height - 1 - ring, width - ring * 2, 1, border);
    bitmap.fillRect(x + ring, y + ring, 1, height - ring * 2, border);
    bitmap.fillRect(x + width - 1 - ring, y + ring, 1, height - ring * 2, border);
  }
}

function drawText(bitmap: Bitmap, element: TextElement, greyscale: boolean): void {
  const text = element.text ?? '';
  const color = shade(parseColor(element.color ?? '#00000000'), greyscale);
  if (!text.trim() || color.a === 0) {
    return;
  }

  // `bold` is the only font meaningfully taller than tiny on the device, so the
  // preview approximates it by doubling the 3x5 cell.
  const scale = element.font === 'bold' ? 2 : 1;
  const width = textWidth(text, scale);
  const { x, y } = anchor(
    element.align,
    element.x,
    element.y,
    width,
    GLYPH_HEIGHT * scale,
  );

  let cursor = x;
  for (const character of text) {
    drawGlyph(bitmap, character, cursor, y, scale, color);
    cursor += (GLYPH_WIDTH + 1) * scale;
  }
}

function drawGlyph(
  bitmap: Bitmap,
  character: string,
  x: number,
  y: number,
  scale: number,
  color: Rgba,
): void {
  const rows = glyph(character);
  for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
    const bits = rows[row] ?? '';
    for (let column = 0; column < GLYPH_WIDTH; column += 1) {
      if (bits[column] !== '1') {
        continue;
      }
      bitmap.fillRect(x + column * scale, y + row * scale, scale, scale, color);
    }
  }
}

/**
 * Turns an anchor point plus alignment into a top-left corner.
 *
 * The device supports more alignments than this; the two projects only use the
 * top row, and guessing at the rest would make the preview lie.
 */
function anchor(
  align: string | undefined,
  x: number | undefined,
  y: number | undefined,
  width: number,
  height: number,
): { x: number; y: number } {
  const left = x ?? 0;
  const top = y ?? 0;
  if (align === 'top_right') {
    return { x: left - width, y: top };
  }
  if (align === 'top_mid') {
    return { x: left - Math.floor(width / 2), y: top };
  }
  if (align === 'mid_left') {
    return { x: left, y: top - Math.floor(height / 2) };
  }
  return { x: left, y: top };
}
