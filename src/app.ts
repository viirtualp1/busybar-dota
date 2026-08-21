import type { BarDisplay } from './bar/display';
import { errorMessage, isForbidden } from './bar/errors';
import { BACK } from './bar/layout';
import type { Config } from './config';
import { detectEvent, initialEventState, type EventState } from './domain/events';
import { EventTicker } from './domain/ticker';
import {
  applyResult,
  beginBreak,
  isBreakExpired,
  type SeriesBreak,
} from './domain/series';
import type { HeroCatalog } from './dota/heroes';
import { LeagueCatalog } from './dota/leagues';
import type { ResultLookup } from './dota/match-result';
import type { Schedule, ScheduleSource } from './dota/schedule/index';
import type { MatchSource } from './dota/source';
import { PortraitStore } from './dota/portraits';
import { idleSnapshot, isDrafting, type MatchSnapshot } from './dota/types';
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

const NO_PORTRAITS: ReadonlySet<number> = new Set();

export class App {
  private readonly config: Config;
  private readonly source: MatchSource;
  private readonly scheduleSource: ScheduleSource;
  private readonly results: ResultLookup;
  private readonly heroes: HeroCatalog;
  private readonly display: BarDisplay;
  private readonly logger: Logger;
  private readonly ticker = new EventTicker();
  private readonly portraits: PortraitStore | null;
  private readonly leagues = new LeagueCatalog();

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

  constructor(deps: AppDeps) {
    this.config = deps.config;
    this.source = deps.source;
    this.scheduleSource = deps.schedule;
    this.results = deps.results;
    this.heroes = deps.heroes;
    this.display = deps.display;
    this.logger = deps.logger ?? console;
    this.portraits = this.config.banPortraits
      ? new PortraitStore(this.heroes, (path, data) =>
          this.display.uploadAsset(path, data),
        )
      : null;
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

    if (this.config.leagueId && (await this.leagues.load(this.config.leagueId))) {
      this.logger.info(`League ${this.config.leagueId}: ${this.leagues.name}`);
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
        this.prepareBans();
        await this.trackLeague();
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

  // The idle screen names the tournament, so the league of whatever game is being
  // followed is worth knowing even when LEAGUE_ID was never set.
  private async trackLeague() {
    const known = this.leagues.name;
    if (!this.snapshot.leagueId) {
      return;
    }

    await this.leagues.load(this.snapshot.leagueId, this.config.requestTimeoutMs);
    if (this.leagues.name && this.leagues.name !== known) {
      this.logger.info(`League ${this.snapshot.leagueId}: ${this.leagues.name}`);
    }
  }

  // Icons are fetched and uploaded during the draft, so the grid is ready to draw
  // the moment the picks are in. A failure just leaves the bans as text.
  private prepareBans() {
    if (!this.portraits || !isDrafting(this.snapshot)) {
      return;
    }
    const bans = [...this.snapshot.radiant.draft.bans, ...this.snapshot.dire.draft.bans];
    if (bans.length === 0) {
      return;
    }

    void this.portraits.prepare(bans).catch((error: unknown) => {
      this.warnRepeated('portraits', `Ban portraits unavailable: ${errorMessage(error)}`);
    });
  }

  private async renderLoop() {
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
            portraits: this.portraits?.ready ?? NO_PORTRAITS,
            leagueName: this.leagues.name,
          }),
        );
      } catch (error) {
        this.warnRepeated('draw', `BUSY Bar draw failed: ${errorMessage(error)}`);
      }

      await this.sleep(this.config.frameMs);
    }
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
