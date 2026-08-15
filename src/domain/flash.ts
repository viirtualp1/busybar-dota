import type { MatchEvent } from './events.js';

export const FLASH_MS = 700;

/** Keeps an LED colour on screen for a moment after the event that caused it. */
export class FlashWindow {
  private event: MatchEvent = null;
  private until = 0;

  constructor(private readonly durationMs = FLASH_MS) {}

  trigger(event: MatchEvent, nowMs: number): void {
    if (event === null) {
      return;
    }
    this.event = event;
    this.until = nowMs + this.durationMs;
  }

  active(nowMs: number): MatchEvent {
    return nowMs < this.until ? this.event : null;
  }
}
