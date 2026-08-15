import type { BarDisplay } from './bar/display.js';
import { errorMessage, isForbidden } from './bar/errors.js';
import { BACK } from './bar/layout.js';
import type { Config } from './config.js';
import { detectEvent, initialEventState, type EventState } from './domain/events.js';
import { FlashWindow } from './domain/flash.js';
import type { HeroCatalog } from './dota/heroes.js';
import type { MatchSource } from './dota/source.js';
import { idleSnapshot, type MatchSnapshot } from './dota/types.js';
import { buildFrame } from './view/frame.js';

export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type AppDeps = {
  config: Config;
  source: MatchSource;
  heroes: HeroCatalog;
  display: BarDisplay;
  logger?: Logger;
};

const BAR_RETRY_MS = 2000;
const REPEAT_WARNING_MS = 30_000;

export class App {
  private readonly config: Config;
  private readonly source: MatchSource;
  private readonly heroes: HeroCatalog;
  private readonly display: BarDisplay;
  private readonly logger: Logger;
  private readonly flash = new FlashWindow();

  private snapshot: MatchSnapshot = idleSnapshot();
  private events: EventState = initialEventState;
  private idleNote = 'waiting for the next game';
  private running = false;
  private loops: Promise<void>[] = [];
  private warnings = new Map<string, { message: string; at: number }>();

  constructor(deps: AppDeps) {
    this.config = deps.config;
    this.source = deps.source;
    this.heroes = deps.heroes;
    this.display = deps.display;
    this.logger = deps.logger ?? console;
  }

  async start(): Promise<void> {
    this.running = true;
    await this.connectBar();
    if (!this.running) {
      return;
    }
    // Hero names are cosmetic: a failed catalog shows `#42` rather than
    // blocking the whole display behind a third-party request.
    if (!(await this.heroes.load())) {
      this.logger.warn('Hero names unavailable, showing hero ids');
    }
    this.loops = [this.pollLoop(), this.renderLoop()];
  }

  async wait(): Promise<void> {
    await Promise.all(this.loops);
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    await Promise.allSettled(this.loops);
    try {
      await this.display.clear();
    } catch {
      // the device may already be gone
    }
  }

  private async connectBar(): Promise<void> {
    while (this.running) {
      try {
        await this.display.ping();
        this.logger.info(`BUSY Bar connected (${this.config.busyAddr})`);
        this.display.markStale();
        return;
      } catch (error) {
        const hint =
          isForbidden(error) && !this.config.isCloud
            ? ' — set BUSY_HTTP_PASSWORD to the HTTP Access password, leave BUSY_TOKEN empty'
            : '';
        this.warnRepeated(
          'bar',
          `Waiting for BUSY Bar at ${this.config.busyAddr}: ${errorMessage(error)}${hint}`,
        );
        await this.sleep(BAR_RETRY_MS);
      }
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const next = await this.source.poll();
        this.snapshot = next ?? idleSnapshot();
        this.idleNote = next ? '' : 'waiting for the next game';
        this.handleEvents();
        this.warnings.delete('source');
      } catch (error) {
        // Keep the last good frame on screen: a blank bar during a five-second
        // upstream hiccup is worse than slightly stale numbers.
        this.idleNote = errorMessage(error);
        this.warnRepeated('source', `${this.source.label}: ${errorMessage(error)}`);
      }

      await this.sleep(this.config.pollMs);
    }
  }

  private handleEvents(): void {
    const { event, state } = detectEvent(this.events, this.snapshot);
    this.events = state;
    if (event === null) {
      return;
    }

    this.flash.trigger(event, this.now());
    const { radiant, dire } = this.snapshot;
    this.logger.info(
      `[${event}] ${radiant.tag} ${radiant.kills}-${dire.kills} ${dire.tag}`,
    );
  }

  /** Display failures must not take the polling loop down with them. */
  private async renderLoop(): Promise<void> {
    while (this.running) {
      const now = this.now();
      try {
        await this.display.push(
          buildFrame(this.snapshot, {
            heroes: this.heroes,
            maxRows: BACK.maxRows,
            flash: this.flash.active(now),
            idleNote: this.idleNote,
          }),
        );
      } catch (error) {
        this.warnRepeated('draw', `BUSY Bar draw failed: ${errorMessage(error)}`);
      }

      await this.sleep(this.config.frameMs);
    }
  }

  private warnRepeated(key: string, message: string): void {
    const now = this.now();
    const previous = this.warnings.get(key);
    if (
      previous &&
      previous.message === message &&
      now - previous.at < REPEAT_WARNING_MS
    ) {
      return;
    }
    this.warnings.set(key, { message, at: now });
    this.logger.warn(message);
  }

  private now(): number {
    return performance.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
