import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type Rgba = { r: number; g: number; b: number; a: number };

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

  set(x: number, y: number, color: Rgba) {
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
    const blend = (channel: number, value: number) =>
      Math.round(value * alpha + channel * (1 - alpha));
    this.data[offset] = blend(this.data[offset] ?? 0, color.r);
    this.data[offset + 1] = blend(this.data[offset + 1] ?? 0, color.g);
    this.data[offset + 2] = blend(this.data[offset + 2] ?? 0, color.b);
    this.data[offset + 3] = 255;
  }

  fillRect(x: number, y: number, width: number, height: number, color: Rgba) {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        this.set(x + column, y + row, color);
      }
    }
  }

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

export function parseColor(value: string): Rgba {
  const hex = value.replace('#', '');
  // Checking the characters, not just the length: `parseInt` on a non-hex string of the right length yields NaN.
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

export class PngError extends Error {}

// Enough of the format to read what Valve serves: 8-bit RGB or RGBA, not interlaced.
export function decodePng(file: Buffer): Bitmap {
  if (!file.subarray(0, 8).equals(SIGNATURE)) {
    throw new PngError('not a PNG');
  }

  let header: { width: number; height: number; channels: number } | null = null;
  const parts: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const payload = file.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      header = readHeader(payload);
    } else if (type === 'IDAT') {
      parts.push(payload);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!header) {
    throw new PngError('PNG has no header');
  }

  return unfilter(inflateSync(Buffer.concat(parts)), header);
}

function readHeader(payload: Buffer) {
  const depth = payload[8];
  const colorType = payload[9];
  const interlace = payload[12];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new PngError(`unsupported PNG (depth ${depth}, colour ${colorType})`);
  }

  return {
    width: payload.readUInt32BE(0),
    height: payload.readUInt32BE(4),
    channels: colorType === 6 ? 4 : 3,
  };
}

function unfilter(
  raw: Buffer,
  header: { width: number; height: number; channels: number },
): Bitmap {
  const { width, height, channels } = header;
  const stride = width * channels;
  const bitmap = new Bitmap(width, height, { r: 0, g: 0, b: 0, a: 0 });
  const line = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start];
    raw.copy(line, 0, start + 1, start + 1 + stride);

    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? (line[index - channels] ?? 0) : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= channels ? (previous[index - channels] ?? 0) : 0;
      line[index] =
        (((line[index] ?? 0) + predictor(filter, left, up, upLeft)) & 0xff) >>> 0;
    }

    // Written straight into the buffer: `set` would composite alpha away here.
    for (let x = 0; x < width; x += 1) {
      const at = x * channels;
      const pixel = (y * width + x) * 4;
      bitmap.data[pixel] = line[at] ?? 0;
      bitmap.data[pixel + 1] = line[at + 1] ?? 0;
      bitmap.data[pixel + 2] = line[at + 2] ?? 0;
      bitmap.data[pixel + 3] = channels === 4 ? (line[at + 3] ?? 0) : 255;
    }
    line.copy(previous);
  }

  return bitmap;
}

function predictor(filter: number | undefined, left: number, up: number, upLeft: number) {
  if (filter === 1) {
    return left;
  }
  if (filter === 2) {
    return up;
  }
  if (filter === 3) {
    return Math.floor((left + up) / 2);
  }
  if (filter === 4) {
    return paeth(left, up, upLeft);
  }

  return 0;
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) {
    return left;
  }

  return dUp <= dUpLeft ? up : upLeft;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  // Each scanline is prefixed with its filter type; 0 means "none".
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
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

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

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
