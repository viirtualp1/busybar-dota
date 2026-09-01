import { existsSync } from 'node:fs';
import {
  type BarConfig,
  DEFAULTS as BAR_DEFAULTS,
  LIMITS as BAR_LIMITS,
  loadBarConfig,
} from 'busybar-kit/config';
import type { ScheduleKind } from './dota/schedule/index';
import type { TickerStyle } from 'busybar-kit/ticker';

export { loadEnvFile } from 'busybar-kit/config';

export type Config = BarConfig & {
  steamApiKey: string;
  leagueId: number;
  matchId: string;
  pollMs: number;
  frameMs: number;
  requestTimeoutMs: number;
  demo: boolean;
  sounds: boolean;
  tickerStyle: TickerStyle;
  tickerChars: number;
  killSoundGapMs: number;
  scheduleKind: ScheduleKind;
  scheduleFile: string;
  stratzToken: string;
};

export type LoadedConfig = {
  config: Config;
  warnings: string[];
};

export const DEFAULTS = {
  pollMs: 5000,
  killSoundGapMs: 4000,
  tickerChars: 17,
} as const;

const LIMITS = {
  pollMs: { min: 2000, max: 60_000 },
  leagueId: { min: 0, max: 100_000_000 },
  killSoundGapMs: { min: 0, max: 60_000 },
  tickerChars: { min: 8, max: 40 },
} as const;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
): LoadedConfig {
  const warnings: string[] = [];
  const { bar, env: reader } = loadBarConfig(env, warnings);
  const { read, number } = reader;

  const steamApiKey = read('STEAM_API_KEY');
  const demo = argv.includes('--demo') || read('DEMO') === '1';

  const scheduleFile = read('SCHEDULE_FILE') || 'schedule.json';
  const stratzToken = read('STRATZ_TOKEN');
  const scheduleKind = readScheduleKind(
    read('SCHEDULE_SOURCE'),
    { demo, scheduleFile, stratzToken },
    warnings,
  );
  if (!steamApiKey && !demo) {
    warnings.push(
      'No STEAM_API_KEY: falling back to OpenDota /live, which has no per-player stats. ' +
        'Get a free key at https://steamcommunity.com/dev/apikey',
    );
  }

  return {
    warnings,
    config: {
      ...bar,
      steamApiKey,
      leagueId: number('LEAGUE_ID', 0, LIMITS.leagueId),
      matchId: read('MATCH_ID'),
      pollMs: number('POLL_MS', DEFAULTS.pollMs, LIMITS.pollMs),
      frameMs: number('FRAME_MS', BAR_DEFAULTS.frameMs, BAR_LIMITS.frameMs),
      requestTimeoutMs: number(
        'REQUEST_TIMEOUT_MS',
        BAR_DEFAULTS.requestTimeoutMs,
        BAR_LIMITS.requestTimeoutMs,
      ),
      demo,
      sounds: read('SOUNDS') !== '0',

      tickerStyle: read('TICKER_STYLE').toLowerCase() === 'scroll' ? 'scroll' : 'page',
      tickerChars: number('TICKER_CHARS', DEFAULTS.tickerChars, LIMITS.tickerChars),
      killSoundGapMs: number(
        'KILL_SOUND_GAP_MS',
        DEFAULTS.killSoundGapMs,
        LIMITS.killSoundGapMs,
      ),
      scheduleKind,
      scheduleFile,
      stratzToken,
    },
  };
}

function readScheduleKind(
  raw: string,
  context: { demo: boolean; scheduleFile: string; stratzToken: string },
  warnings: string[],
): ScheduleKind {
  const requested = raw.toLowerCase();

  if (requested === 'stratz') {
    if (!context.stratzToken) {
      warnings.push(
        'SCHEDULE_SOURCE=stratz needs STRATZ_TOKEN — falling back to no schedule',
      );
      return 'none';
    }
    warnings.push(
      'SCHEDULE_SOURCE=stratz: the query is written to spec but has never run ' +
        'against a live token. Verify it with `npm run stratz:check`.',
    );
    return 'stratz';
  }

  if (requested === 'json') {
    if (!existsSync(context.scheduleFile)) {
      warnings.push(
        `SCHEDULE_SOURCE=json but ${context.scheduleFile} does not exist — ` +
          'copy schedule.example.json to start one',
      );
    }
    return 'json';
  }

  if (requested === 'demo') {
    return 'demo';
  }

  if (requested === 'none') {
    return 'none';
  }

  if (requested) {
    warnings.push(`SCHEDULE_SOURCE=${requested} is unknown, using auto-detection`);
  }

  if (context.demo) {
    return 'demo';
  }

  return existsSync(context.scheduleFile) ? 'json' : 'none';
}
