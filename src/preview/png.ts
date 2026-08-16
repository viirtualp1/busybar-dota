/**
 * A minimal PNG encoder — enough for RGBA screenshots, nothing more.
 *
 * Writing this out is cheaper than a native image dependency: the preview only
 * ever needs one colour type, no interlacing and no palette, and `node:zlib`
 * already provides the hard part.
 */
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type Rgba = { r: number; g: number; b: number; a: number };

/** A writable RGBA image with the handful of drawing primitives the preview uses. */
export class Bitmap {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    background: Rgba = { r: 0, g: 0, b: 0, a: 255 },
  ) {
    this.data = new Uint8Array(width * height * 4);
    this.fillRect(0, 0, width, height, background);
  }

  /** Alpha-composites a single pixel; out-of-bounds writes are dropped. */
  set(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || color.a === 0) {
      return;
    }
    const offset = (y * this.width + x) * 4;
    if (color.a === 255) {
      this.data[offset] = color.r;
      this.data[offset + 1] = color.g;
      this.data[offset + 2] = color.b;
      this.data[offset + 3] = 255;
      return;
    }
    const alpha = color.a / 255;
    const blend = (channel: number, value: number): number =>
      Math.round(value * alpha + channel * (1 - alpha));
    this.data[offset] = blend(this.data[offset] ?? 0, color.r);
    this.data[offset + 1] = blend(this.data[offset + 1] ?? 0, color.g);
    this.data[offset + 2] = blend(this.data[offset + 2] ?? 0, color.b);
    this.data[offset + 3] = 255;
  }

  fillRect(x: number, y: number, width: number, height: number, color: Rgba): void {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        this.set(x + column, y + row, color);
      }
    }
  }

  /** Nearest-neighbour upscale, so LED pixels stay square and countable. */
  scale(factor: number): Bitmap {
    const scaled = new Bitmap(this.width * factor, this.height * factor);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const offset = (y * this.width + x) * 4;
        const color: Rgba = {
          r: this.data[offset] ?? 0,
          g: this.data[offset + 1] ?? 0,
          b: this.data[offset + 2] ?? 0,
          a: 255,
        };
        scaled.fillRect(x * factor, y * factor, factor, factor, color);
      }
    }
    return scaled;
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

const HEX_COLOR = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

/** `#RRGGBBAA` or `#RRGGBB`. Anything else is treated as fully transparent. */
export function parseColor(value: string): Rgba {
  const hex = value.replace('#', '');
  // Checking the characters, not just the length: `parseInt` on a non-hex string
  // of the right length yields NaN and paints garbage.
  if (!HEX_COLOR.test(hex)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
  };
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  // Each scanline is prefixed with its filter type; 0 means "none", which is
  // fine for images this small.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
