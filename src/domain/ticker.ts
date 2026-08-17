import type { MatchEvent } from './events';

export const TICKER_MS = 7000;

export type ActiveTicker = {
  event: MatchEvent;
  elapsedMs: number;
};

export class EventTicker {
  private event: MatchEvent | null = null;
  private startedAt = 0;
  private until = 0;

  constructor(private readonly durationMs = TICKER_MS) {}

  push(event: MatchEvent | null, nowMs: number) {
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
