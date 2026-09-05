import type { BarDisplay } from './bar/display';
import { errorMessage, isForbidden } from 'busybar-kit/errors';
import { BACK } from './bar/layout';
import type { Config } from './config';
import {
  detectEvent,
  initialEventState,
  type EventState,
  type MatchEvent,
} from './domain/events';
import { EventTicker } from 'busybar-kit/ticker';
import {
  applyResult,
  beginBreak,
  isBreakExpired,
  isSeriesOver,
  isShowingResult,
  type SeriesBreak,
} from './domain/series';
import type { HeroCatalog } from './dota/heroes';
import type { ResultLookup } from './dota/match-result';
import type { Schedule, ScheduleSource } from './dota/schedule/index';
import type { MatchSource } from './dota/source';
import { idleSnapshot, type MatchSnapshot } from './dota/types';
import { buildFrame } from './view/frame';

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

const SCHEDULE_POLL_MS = 120_000;

export class App {
  private readonly config: Config;
  private readonly source: MatchSource;
  private readonly scheduleSource: ScheduleSource;
  private readonly results: ResultLookup;
  private readonly heroes: HeroCatalog;
  private readonly display: BarDisplay;
  private readonly logger: Logger;
  private readonly ticker = new EventTicker<MatchEvent>();

  private snapshot: MatchSnapshot = idleSnapshot();
  private schedule: Schedule | null = null;
  private scheduleFetchedAt = 0;

  private lastLive: MatchSnapshot | null = null;
  private seriesBreak: SeriesBreak | null = null;
  private events: EventState = initialEventState;
  private idleNote = 'waiting for the next game';
  private running = false;
  private loops: Promise<void>[] = [];
  private warnings = new Map<string, { message: string; at: number }>();
  private blanked = false;

  constructor(deps: AppDeps) {
    this.config = deps.config;
    this.source = deps.source;
    this.scheduleSource = deps.schedule;
    this.results = deps.results;
    this.heroes = deps.heroes;
    this.display = deps.display;
    this.logger = deps.logger ?? console;
  }

  async start() {
    this.running = true;
    await this.connectBar();
    if (!this.running) {
      return;
    }

    if (!(await this.heroes.load())) {
      this.logger.warn('Hero names unavailable, showing hero ids');
    }
    this.loops = [this.pollLoop(), this.renderLoop()];
  }

  async wait() {
    await Promise.all(this.loops);
  }

  async stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    await Promise.allSettled(this.loops);
    try {
      await this.display.clear();
    } catch {
      /* bar already gone */
    }
  }

  private async connectBar() {
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

  private async pollLoop() {
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
        this.idleNote = errorMessage(error);
        this.warnRepeated('source', `${this.source.label}: ${errorMessage(error)}`);
      }

      await this.sleep(this.config.pollMs);
    }
  }

  private async trackSeries(live: MatchSnapshot | null) {
    if (live) {
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

  private async refreshSchedule() {
    const now = Date.now();
    if (this.schedule && now - this.scheduleFetchedAt < SCHEDULE_POLL_MS) {
      return;
    }

    try {
      this.schedule = await this.scheduleSource.poll();
      this.scheduleFetchedAt = now;
      this.warnings.delete('schedule');
    } catch (error) {
      this.warnRepeated(
        'schedule',
        `${this.scheduleSource.label}: ${errorMessage(error)}`,
      );
    }
  }

  private handleEvents() {
    const { event, state } = detectEvent(this.events, this.snapshot, (id) =>
      this.heroes.name(id),
    );
    this.events = state;
    if (event === null) {
      return;
    }

    if (!this.ticker.push(event, this.now())) {
      return;
    }

    this.logger.info(`[${event.kind}] ${event.text}`);
    if (this.config.sounds) {
      void this.display.playEvent(event).catch(() => {
        /* sound is optional */
      });
    }
  }

  private async renderLoop() {
    while (this.running) {
      const now = this.now();
      try {
        if (this.wantsScreen()) {
          this.blanked = false;
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
        } else {
          await this.blank();
        }
      } catch (error) {
        this.warnRepeated('draw', `BUSY Bar draw failed: ${errorMessage(error)}`);
      }

      await this.sleep(this.config.frameMs);
    }
  }

  private wantsScreen() {
    if (this.snapshot.live) {
      return true;
    }
    if (!this.seriesBreak) {
      return false;
    }
    const now = Date.now();
    return isShowingResult(this.seriesBreak, now) || !isSeriesOver(this.seriesBreak);
  }

  private async blank() {
    if (this.blanked) {
      return;
    }
    await this.display.blank();
    this.blanked = true;
    this.logger.info('Idle — display released');
  }

  private warnRepeated(key: string, message: string) {
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

  private now() {
    return performance.now();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
