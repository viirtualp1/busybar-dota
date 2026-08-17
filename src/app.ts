import type { BarDisplay } from './bar/display.js';
import { errorMessage, isForbidden } from './bar/errors.js';
import { BACK } from './bar/layout.js';
import type { Config } from './config.js';
import { detectEvent, initialEventState, type EventState } from './domain/events.js';
import { EventTicker } from './domain/ticker.js';
import {
  applyResult,
  beginBreak,
  isBreakExpired,
  type SeriesBreak,
} from './domain/series.js';
import type { HeroCatalog } from './dota/heroes.js';
import type { ResultLookup } from './dota/match-result.js';
import type { Schedule, ScheduleSource } from './dota/schedule/index.js';
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
  schedule: ScheduleSource;
  results: ResultLookup;
  heroes: HeroCatalog;
  display: BarDisplay;
  logger?: Logger;
};

const BAR_RETRY_MS = 2000;
const REPEAT_WARNING_MS = 30_000;

/**
 * Schedules move on the order of hours, so they are polled far more slowly than
 * the live match — and only while nothing is live, which is the only time the
 * answer is on screen.
 */
const SCHEDULE_POLL_MS = 120_000;

export class App {
  private readonly config: Config;
  private readonly source: MatchSource;
  private readonly scheduleSource: ScheduleSource;
  private readonly results: ResultLookup;
  private readonly heroes: HeroCatalog;
  private readonly display: BarDisplay;
  private readonly logger: Logger;
  private readonly ticker = new EventTicker();

  private snapshot: MatchSnapshot = idleSnapshot();
  private schedule: Schedule | null = null;
  private scheduleFetchedAt = 0;
  /** The last snapshot that was actually live, kept to detect a series break. */
  private lastLive: MatchSnapshot | null = null;
  private seriesBreak: SeriesBreak | null = null;
  private events: EventState = initialEventState;
  private idleNote = 'waiting for the next game';
  private running = false;
  private loops: Promise<void>[] = [];
  private warnings = new Map<string, { message: string; at: number }>();

  constructor(deps: AppDeps) {
    this.config = deps.config;
    this.source = deps.source;
    this.scheduleSource = deps.schedule;
    this.results = deps.results;
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
        await this.trackSeries(next);
        if (!next) {
          await this.refreshSchedule();
        }
      } catch (error) {
        // Keep the last good frame on screen: a blank bar during a five-second
        // upstream hiccup is worse than slightly stale numbers.
        this.idleNote = errorMessage(error);
        this.warnRepeated('source', `${this.source.label}: ${errorMessage(error)}`);
      }

      await this.sleep(this.config.pollMs);
    }
  }

  /**
   * Notices a series going on break, and resolves who won the game that ended.
   *
   * The live feed drops a game the moment it finishes and the series score it
   * carried was the score *going into* that game, so the winner has to be looked
   * up separately or the break would show a score one game out of date.
   */
  private async trackSeries(live: MatchSnapshot | null): Promise<void> {
    if (live) {
      // A game is running, so any break is over.
      this.lastLive = live;
      this.seriesBreak = null;
      return;
    }

    const now = Date.now();
    if (!this.seriesBreak && this.lastLive) {
      this.seriesBreak = beginBreak(this.lastLive, now);
      this.lastLive = null;
      if (this.seriesBreak) {
        this.logger.info(
          `[series break] ${this.seriesBreak.radiantTag} vs ${this.seriesBreak.direTag}, ` +
            `game ${this.seriesBreak.nextGame - 1} finished`,
        );
      }
    }

    if (!this.seriesBreak) {
      return;
    }
    if (isBreakExpired(this.seriesBreak, now)) {
      this.logger.info('[series break] nothing resumed, falling back to the schedule');
      this.seriesBreak = null;
      return;
    }
    if (!this.seriesBreak.pendingResult) {
      return;
    }

    // Expected to come back empty for the first few minutes while the match is
    // still being ingested; every poll is another attempt.
    const winner = await this.results.winnerOf(this.seriesBreak.lastMatchId);
    if (!winner) {
      return;
    }
    const updated = applyResult(this.seriesBreak, winner);
    this.seriesBreak = updated;
    this.logger.info(
      updated
        ? `[series break] ${winner} took it, series ${updated.radiantWins}-${updated.direWins}`
        : `[series break] ${winner} took the series`,
    );
  }

  /** Kept out of the main poll rhythm: a bracket does not change every 5 seconds. */
  private async refreshSchedule(): Promise<void> {
    const now = Date.now();
    if (this.schedule && now - this.scheduleFetchedAt < SCHEDULE_POLL_MS) {
      return;
    }
    try {
      this.schedule = await this.scheduleSource.poll();
      this.scheduleFetchedAt = now;
      this.warnings.delete('schedule');
    } catch (error) {
      // A missing schedule is not fatal — the display falls back to the plain
      // idle screen rather than showing a stale countdown to a match that
      // already started.
      this.warnRepeated(
        'schedule',
        `${this.scheduleSource.label}: ${errorMessage(error)}`,
      );
    }
  }

  private handleEvents(): void {
    const { event, state } = detectEvent(this.events, this.snapshot);
    this.events = state;
    if (event === null) {
      return;
    }
    if (!this.ticker.push(event, this.now())) {
      // Something more important is still on screen; do not chirp underneath it.
      return;
    }

    this.logger.info(`[${event.kind}] ${event.text}`);
    if (this.config.sounds) {
      void this.display.playEvent(event).catch(() => {
        // sound is cosmetic
      });
    }
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
            ticker: this.ticker.active(now),
            nowEpochMs: Date.now(),
            schedule: this.schedule,
            seriesBreak: this.seriesBreak,
            idleNote: this.idleNote,
            tickerStyle: this.config.tickerStyle,
            tickerChars: this.config.tickerChars,
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
