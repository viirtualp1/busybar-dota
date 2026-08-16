import { JsonScheduleSource } from './json.js';
import { StratzScheduleSource } from './stratz.js';
import type { Schedule, ScheduleSource } from './types.js';

export * from './types.js';
export { JsonScheduleSource, parseScheduleFile, ScheduleFileError } from './json.js';
export { StratzScheduleSource, LEAGUE_QUERY } from './stratz.js';

export type ScheduleKind = 'json' | 'stratz' | 'demo' | 'none';

export type ScheduleConfig = {
  kind: ScheduleKind;
  file: string;
  stratzToken: string;
  leagueId: number;
  timeoutMs: number;
};

/** Used when nothing is configured: the display shows the plain idle screen. */
export const NO_SCHEDULE: ScheduleSource = {
  label: 'none (set SCHEDULE_SOURCE to show upcoming matches)',
  poll: () => Promise.resolve(null),
};

export function createScheduleSource(config: ScheduleConfig): ScheduleSource {
  switch (config.kind) {
    case 'json':
      return new JsonScheduleSource(config.file);
    case 'stratz':
      return new StratzScheduleSource({
        token: config.stratzToken,
        leagueId: config.leagueId,
        timeoutMs: config.timeoutMs,
      });
    case 'demo':
      return new DemoScheduleSource();
    case 'none':
      return NO_SCHEDULE;
  }
}

/**
 * A synthetic schedule, so the upcoming view can be built and screenshotted
 * without a key and without waiting for a real tournament break.
 */
export class DemoScheduleSource implements ScheduleSource {
  readonly label = 'demo (synthetic schedule)';

  constructor(private readonly startsInMs = 23 * 60 * 1000 + 12_000) {}

  poll(): Promise<Schedule> {
    return Promise.resolve({
      next: {
        teamA: 'Team Spirit',
        teamB: 'Falcons',
        tagA: 'TS',
        tagB: 'FLC',
        startsAtMs: Date.now() + this.startsInMs,
        stage: 'Upper Bracket R2',
        stageShort: 'UB2',
        bestOf: 3,
      },
      bracket: [
        { label: 'UB R1', text: 'Spirit 2-0 Tundra', next: false },
        { label: 'UB R1', text: 'Falcons 2-1 Liquid', next: false },
        { label: 'UB R2', text: 'Spirit vs Falcons', next: true },
        { label: 'LB R2', text: 'Tundra vs Liquid', next: false },
        { label: 'LB R3', text: 'TBD vs TBD', next: false },
      ],
    });
  }
}
