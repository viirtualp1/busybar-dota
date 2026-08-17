import type { MatchEvent } from './events.js';

/**
 * How long an event owns the bottom row of the front display.
 *
 * Long enough to read a short line at a glance, short enough that the clock is
 * never gone when you look up wanting it.
 */
export const TICKER_MS = 3500;

/**
 * Holds the most recent event on screen for a moment, then gets out of the way.
 *
 * Also does the LED flash the old `FlashWindow` did — same window, one less
 * thing to keep in sync.
 */
export class EventTicker {
  private event: MatchEvent | null = null;
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
    if (showing && event.priority <= showing.priority) {
      return false;
    }
    this.event = event;
    this.until = nowMs + this.durationMs;
    return true;
  }

  active(nowMs: number): MatchEvent | null {
    return nowMs < this.until ? this.event : null;
  }
}
