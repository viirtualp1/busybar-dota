import type { HeroCatalog } from './heroes';
import { Bitmap, decodePng } from '../preview/png';

const ICON_URL = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';

export const PORTRAIT_SIZE = 16;

// The back panel is 16 greys, so the icons are quantised to the same ladder here
// rather than being dithered into mud by the device.
const SHADES = 16;

export type PortraitUpload = (path: string, data: Buffer) => Promise<void>;

export function portraitPath(heroId: number) {
  return `bans/${heroId}.png`;
}

export function portraitUrl(slug: string) {
  return `${ICON_URL}/heroes/icons/${slug}.png`;
}

export class PortraitStore {
  private readonly images = new Map<number, Bitmap>();
  private readonly done = new Set<number>();
  private readonly failed = new Set<number>();
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly heroes: HeroCatalog,
    private readonly upload: PortraitUpload,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get ready(): ReadonlySet<number> {
    return this.done;
  }

  image(heroId: number) {
    return this.images.get(heroId) ?? null;
  }

  // One pass at a time: a draft adds bans faster than the device accepts uploads.
  prepare(heroIds: readonly number[]): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const missing = heroIds.filter(
      (heroId) => heroId > 0 && !this.done.has(heroId) && !this.failed.has(heroId),
    );
    if (missing.length === 0) {
      return Promise.resolve();
    }

    this.inFlight = this.run(missing).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async run(heroIds: readonly number[]) {
    let failure: Error | null = null;
    for (const heroId of heroIds) {
      try {
        const image = await this.render(heroId);
        await this.upload(portraitPath(heroId), image.toPng());
        this.images.set(heroId, image);
        this.done.add(heroId);
      } catch (error) {
        // A hero whose icon will not load is not worth retrying every poll, but
        // the caller still hears about it once so a dead upload is not silent.
        this.failed.add(heroId);
        failure = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (failure) {
      throw failure;
    }
  }

  private async render(heroId: number) {
    const slug = this.heroes.slug(heroId);
    if (!slug) {
      throw new Error(`no icon name for hero ${heroId}`);
    }

    const response = await this.fetchImpl(portraitUrl(slug));
    if (!response.ok) {
      throw new Error(`icon for ${slug} responded ${response.status}`);
    }

    const source = decodePng(Buffer.from(await response.arrayBuffer()));

    return toPortrait(source, PORTRAIT_SIZE);
  }
}

// Box filter down to the panel size, flattened onto black, stretched to use the
// whole range — the icons are dark and 16 greys is not much to lose — and quantised.
export function toPortrait(source: Bitmap, size: number): Bitmap {
  const target = new Bitmap(size, size, { r: 0, g: 0, b: 0, a: 255 });
  const stepX = source.width / size;
  const stepY = source.height / size;

  const greys: number[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      greys.push(box(source, x * stepX, y * stepY, stepX, stepY));
    }
  }

  const brightest = Math.max(...greys);
  const gain = brightest > 0 ? 255 / brightest : 1;
  for (let index = 0; index < greys.length; index += 1) {
    const grey = quantise((greys[index] ?? 0) * gain);
    target.set(index % size, Math.floor(index / size), {
      r: grey,
      g: grey,
      b: grey,
      a: 255,
    });
  }

  return target;
}

function box(source: Bitmap, left: number, top: number, width: number, height: number) {
  let total = 0;
  let count = 0;
  for (
    let y = Math.floor(top);
    y < Math.min(source.height, Math.ceil(top + height));
    y += 1
  ) {
    for (
      let x = Math.floor(left);
      x < Math.min(source.width, Math.ceil(left + width));
      x += 1
    ) {
      const at = (y * source.width + x) * 4;
      const alpha = (source.data[at + 3] ?? 0) / 255;
      total += luminance(source, at) * alpha;
      count += 1;
    }
  }

  return count === 0 ? 0 : total / count;
}

function luminance(source: Bitmap, at: number) {
  return (
    0.2126 * (source.data[at] ?? 0) +
    0.7152 * (source.data[at + 1] ?? 0) +
    0.0722 * (source.data[at + 2] ?? 0)
  );
}

function quantise(value: number) {
  const step = 255 / (SHADES - 1);

  return Math.min(255, Math.max(0, Math.round(Math.round(value / step) * step)));
}
