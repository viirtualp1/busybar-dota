import type { MatchEvent } from './events.js';

/**
 * How long an event owns the bottom row of the front display.
 *
 * Long enough for a scrolling sentence to finish, short enough that the clock
 * is never gone when you look up wanting it.
 */
export const TICKER_MS = 7000;

/**
 * Holds the most recent event on screen for a moment, then gets out of the way.
 *
 * Also does the LED flash the old `FlashWindow` did — same window, one less
 * thing to keep in sync.
 */
export type ActiveTicker = {
  event: MatchEvent;
  /** How long it has been on screen, which is what drives the scroll. */
  elapsedMs: number;
};

export class EventTicker {
  private event: MatchEvent | null = null;
  private startedAt = 0;
  private until = 0;

  constructor(private readonly durationMs = TICKER_MS) {}

  /**
   * A more important event interrupts a less important one; an equal or lesser
   * one waits its turn rather than cutting a Roshan line short for a kill.
   */
  push(event: MatchEvent | null, nowMs: number): boolean {
    if (!event) {
      return false;
    }
    const showing = this.active(nowMs);
    if (showing && event.priority <= showing.event.priority) {
      return false;
    }
    this.event = event;
    this.startedAt = nowMs;
    this.until = nowMs + this.durationMs;
    return true;
  }

  active(nowMs: number): ActiveTicker | null {
    if (nowMs >= this.until || !this.event) {
      return null;
    }
    return { event: this.event, elapsedMs: nowMs - this.startedAt };
  }
}
