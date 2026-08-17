import { JsonScheduleSource } from './json';
import { StratzScheduleSource } from './stratz';
import type { Schedule, ScheduleSource, UpcomingMatch } from './types';

export * from './types';
export { JsonScheduleSource, parseScheduleFile, ScheduleFileError } from './json';
export { StratzScheduleSource, LEAGUE_QUERY } from './stratz';

export type ScheduleKind = 'json' | 'stratz' | 'demo' | 'none';

export type ScheduleConfig = {
  kind: ScheduleKind;
  file: string;
  stratzToken: string;
  leagueId: number;
  timeoutMs: number;
};

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

export class DemoScheduleSource implements ScheduleSource {
  readonly label = 'demo (synthetic schedule)';

  constructor(private readonly startsInMs = 23 * 60 * 1000 + 12_000) {}

  poll(): Promise<Schedule> {
    const nextStarts = Date.now() + this.startsInMs;
    const next: UpcomingMatch = {
      teamA: 'Team Spirit',
      teamB: 'Falcons',
      tagA: 'TS',
      tagB: 'FLC',
      startsAtMs: nextStarts,
      stage: 'Upper Bracket R2',
      stageShort: 'UB2',
      bestOf: 3,
    };
    const later: UpcomingMatch[] = [
      {
        teamA: 'Tundra',
        teamB: 'Liquid',
        tagA: 'TUND',
        tagB: 'LIQ',
        startsAtMs: nextStarts + 2 * 60 * 60 * 1000,
        stage: 'Lower Bracket R2',
        stageShort: 'LB2',
        bestOf: 3,
      },
      {
        teamA: 'TBD',
        teamB: 'TBD',
        tagA: 'TBD',
        tagB: 'TBD',
        startsAtMs: nextStarts + 4 * 60 * 60 * 1000,
        stage: 'Lower Bracket R3',
        stageShort: 'LB3',
        bestOf: 3,
      },
    ];
    return Promise.resolve({
      next,
      upcoming: [next, ...later],
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
