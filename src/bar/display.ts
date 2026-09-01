import { BusyBar, type DisplayDrawParams } from '@busy-app/busy-lib';
import type { MatchEvent, MatchEventKind } from '../domain/events';
import type { DotaFrame } from '../view/frame';
import { backElements, frontElements } from './elements';
import { isClientError, isLowPriority, toBarError } from 'busybar-kit/errors';

export const APP_NAME = 'dota';

const SOUNDS: Partial<Record<MatchEventKind, readonly string[]>> = {
  tower: [
    'shared/calendar_event_starts.snd',
    'shared/calendar_event_starts.wav',
    'shared/volume_change.snd',
  ],
  barracks: [
    'shared/calendar_event_starts.snd',
    'shared/calendar_event_starts.wav',
    'shared/volume_change.snd',
  ],
  roshan: [
    'shared/calendar_event_starts.snd',
    'shared/calendar_event_starts.wav',
    'shared/volume_change.snd',
  ],
  'match-start': ['shared/calendar_event_starts.snd', 'shared/volume_change.snd'],
  'match-end': ['shared/calendar_event_starts.snd', 'shared/volume_change.snd'],
};

export type BarConnection = {
  addr: string;
  token: string;
  httpPassword: string;
  timeoutMs?: number;
};

export function createBusyBar(connection: BarConnection): BusyBar {
  return new BusyBar({
    addr: connection.addr,
    timeout: connection.timeoutMs ?? 5000,
    ...(connection.token ? { token: connection.token } : {}),
    ...(connection.httpPassword ? { HTTPAccessPassword: connection.httpPassword } : {}),
  });
}

export class BarDisplay {
  private drawing = false;
  private stopped = false;
  private queued: DotaFrame | null = null;
  private lastKey = '';
  private cleared = false;
  private warnedPriority = false;
  private failedSounds = new Set<string>();

  constructor(
    private readonly bar: BusyBar,
    private readonly priority: number,
  ) {}

  async ping() {
    await this.bar.SystemStatusGet();
  }

  markStale() {
    this.cleared = false;
    this.lastKey = '';
  }

  stop() {
    this.stopped = true;
    this.queued = null;
  }

  async push(frame: DotaFrame) {
    if (this.stopped) {
      return;
    }

    const key = JSON.stringify(frame);
    if (key === this.lastKey) {
      return;
    }

    this.queued = frame;
    if (this.drawing) {
      return;
    }

    this.drawing = true;
    try {
      while (this.queued && !this.stopped) {
        const next = this.queued;
        this.queued = null;
        await this.draw(next);
        this.lastKey = JSON.stringify(next);
      }
    } catch (error) {
      this.markStale();
      throw error;
    } finally {
      this.drawing = false;
    }
  }

  async playEvent(event: MatchEvent) {
    if (!event.sound) {
      return;
    }
    const names = SOUNDS[event.kind];
    if (!names) {
      return;
    }

    for (const name of names) {
      if (this.failedSounds.has(name)) {
        continue;
      }

      try {
        await this.bar.AudioPlay({ application_name: APP_NAME, stock_path: name });
        return;
      } catch (error) {
        // 4xx means this file is not there; anything else is transient.
        if (!isClientError(error)) {
          return;
        }
        this.failedSounds.add(name);
      }
    }
  }

  async clear() {
    this.stop();
    this.lastKey = '';
    this.cleared = false;
    await this.bar.DisplayClear({ application_name: APP_NAME });
  }

  private async draw(frame: DotaFrame) {
    if (!this.cleared) {
      await this.bar.DisplayClear({ application_name: APP_NAME });
      this.cleared = true;
    }

    const payload: DisplayDrawParams = {
      application_name: APP_NAME,
      priority: this.priority,
      ...(frame.ledColor ? { led_notification_color: frame.ledColor } : {}),
      elements: [...backElements(frame), ...frontElements(frame)],
    };

    try {
      await this.drawRaw(payload);
      this.warnedPriority = false;
    } catch (error) {
      if (!isLowPriority(error)) {
        throw error;
      }

      if (!this.warnedPriority) {
        console.warn(
          'BUSY Bar is showing a higher-priority app (BUSY/CUSTOM session). Waiting…',
        );
        this.warnedPriority = true;
      }
    }
  }

  // The generated DisplayDraw helper drops `led_notification_color`, so post directly.
  private async drawRaw(payload: DisplayDrawParams) {
    const client = this.bar.apiClient;
    const { error } = await client.execute((signal) =>
      client.POST('/display/draw', {
        body: payload,
        ...(signal ? { signal } : {}),
      }),
    );
    if (error) {
      throw toBarError(error);
    }
  }
}
