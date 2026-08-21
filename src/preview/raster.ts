import type { ImageElement, RectangleElement, TextElement } from '@busy-app/busy-lib';
import { BACK, FRONT } from '../bar/layout';
import { GLYPH_HEIGHT, GLYPH_WIDTH, glyph, textWidth } from './font';
import { Bitmap, parseColor, type Rgba } from './png';

export type AnyElement = TextElement | RectangleElement | ImageElement;

// Images live in the device's assets, so the preview is handed the same bitmaps by path.
export type ImageLookup = (path: string) => Bitmap | null;

const OFF_PIXEL: Rgba = { r: 10, g: 10, b: 12, a: 255 };

export function renderFront(elements: AnyElement[]): Bitmap {
  return render(elements, 'front', FRONT.width, FRONT.height, false);
}

export function renderBack(elements: AnyElement[], images?: ImageLookup): Bitmap {
  return render(elements, 'back', BACK.width, BACK.height, true, images);
}

const BACK_SHADES = 16;

function render(
  elements: AnyElement[],
  display: 'front' | 'back',
  width: number,
  height: number,
  greyscale: boolean,
  images?: ImageLookup,
): Bitmap {
  const bitmap = new Bitmap(width, height, shade(OFF_PIXEL, greyscale));

  for (const element of elements) {
    if (element.display !== display) {
      continue;
    }

    if (element.type === 'rectangle') {
      drawRectangle(bitmap, element, greyscale);
    } else if (element.type === 'text') {
      drawText(bitmap, element, greyscale);
    } else if (element.type === 'image' && images) {
      drawImage(bitmap, element, images);
    }
  }

  return bitmap;
}

function drawImage(bitmap: Bitmap, element: ImageElement, images: ImageLookup) {
  const path = 'path' in element ? element.path : '';
  const source = path ? images(path) : null;
  if (!source) {
    return;
  }

  const { x, y } = anchor(
    element.align,
    element.x,
    element.y,
    source.width,
    source.height,
  );
  for (let row = 0; row < source.height; row += 1) {
    for (let column = 0; column < source.width; column += 1) {
      const at = (row * source.width + column) * 4;
      bitmap.set(x + column, y + row, {
        r: source.data[at] ?? 0,
        g: source.data[at + 1] ?? 0,
        b: source.data[at + 2] ?? 0,
        a: 255,
      });
    }
  }
}

function toBackShade(color: Rgba): Rgba {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const step = 255 / (BACK_SHADES - 1);
  const value = Math.round(Math.round(luminance / step) * step);

  return { r: value, g: value, b: value, a: color.a };
}

function shade(color: Rgba, greyscale: boolean): Rgba {
  return greyscale ? toBackShade(color) : color;
}

function drawRectangle(bitmap: Bitmap, element: RectangleElement, greyscale: boolean) {
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const { x, y } = anchor(element.align, element.x, element.y, width, height);

  if (element.fill !== 'none') {
    const fill = shade(parseColor(element.fill_colors?.[0] ?? '#00000000'), greyscale);
    bitmap.fillRect(x, y, width, height, fill);
  }

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

function drawText(bitmap: Bitmap, element: TextElement, greyscale: boolean) {
  const text = element.text ?? '';
  const color = shade(parseColor(element.color ?? '#00000000'), greyscale);
  if (!text.trim() || color.a === 0) {
    return;
  }

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
) {
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
