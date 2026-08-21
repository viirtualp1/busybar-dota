import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScheduleKind } from './dota/schedule/index';
import { MISSING_KEY } from './dota/source';
import type { TickerStyle } from './view/ticker-text';

export type Config = {
  busyAddr: string;
  isCloud: boolean;
  isUsb: boolean;
  busyToken: string;
  busyHttpPassword: string;
  drawPriority: number;
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
  banPortraits: boolean;
};

export type LoadedConfig = {
  config: Config;
  warnings: string[];
};

export const DEFAULTS = {
  usbAddr: '10.0.4.20',
  cloudAddr: 'https://api.busy.app',
  drawPriority: 40,
  pollMs: 5000,
  frameMs: 200,
  requestTimeoutMs: 10_000,
  killSoundGapMs: 4000,
  tickerChars: 17,
} as const;

const LIMITS = {
  pollMs: { min: 2000, max: 60_000 },
  frameMs: { min: 50, max: 2000 },
  drawPriority: { min: 0, max: 100 },
  requestTimeoutMs: { min: 1000, max: 30_000 },
  leagueId: { min: 0, max: 100_000_000 },
  killSoundGapMs: { min: 0, max: 60_000 },
  tickerChars: { min: 8, max: 40 },
} as const;

export function loadEnvFile(cwd = process.cwd()) {
  const path = resolve(cwd, '.env');
  if (!existsSync(path)) {
    return;
  }
  process.loadEnvFile(path);
}

export function isCloudAddr(addr: string) {
  return /api(?:\.(?:dev|test|stage))?\.busy\.app/i.test(addr);
}

export function isUsbAddr(addr: string) {
  try {
    const url = /^https?:\/\//i.test(addr) ? new URL(addr) : new URL(`http://${addr}`);
    return url.hostname === DEFAULTS.usbAddr;
  } catch {
    return addr.includes(DEFAULTS.usbAddr);
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
): LoadedConfig {
  const warnings: string[] = [];
  const read = (name: string) => env[name]?.trim() ?? '';

  const number = (
    name: string,
    fallback: number,
    limits: { min: number; max: number },
  ) => {
    const raw = read(name);
    if (!raw) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      warnings.push(`${name}=${raw} is not a number, using ${fallback}`);
      return fallback;
    }
    const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(value)));
    if (clamped !== value) {
      warnings.push(
        `${name}=${raw} is out of range ${limits.min}..${limits.max}, using ${clamped}`,
      );
    }
    return clamped;
  };

  const token = read('BUSY_TOKEN');
  const httpPassword = read('BUSY_HTTP_PASSWORD');
  const busyAddr = read('BUSY_ADDR') || (token ? DEFAULTS.cloudAddr : DEFAULTS.usbAddr);
  const cloud = isCloudAddr(busyAddr);
  const usb = isUsbAddr(busyAddr);

  if (cloud && httpPassword) {
    warnings.push('BUSY_HTTP_PASSWORD is ignored on cloud, only BUSY_TOKEN is used');
  }

  if (!cloud && token) {
    warnings.push(
      `BUSY_TOKEN is ignored for ${busyAddr}, that token only works on cloud`,
    );
  }

  if (usb && httpPassword) {
    warnings.push('BUSY_HTTP_PASSWORD is ignored over USB, no auth is required there');
  }

  if (!cloud && !usb && !httpPassword) {
    warnings.push(
      'Wi-Fi needs BUSY_HTTP_PASSWORD (Bar web UI → Network → HTTP API access)',
    );
  }

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
    warnings.push(MISSING_KEY);
  }

  return {
    warnings,
    config: {
      busyAddr,
      isCloud: cloud,
      isUsb: usb,
      busyToken: cloud ? token : '',
      busyHttpPassword: cloud || usb ? '' : httpPassword,
      drawPriority: number('DRAW_PRIORITY', DEFAULTS.drawPriority, LIMITS.drawPriority),
      steamApiKey,
      leagueId: number('LEAGUE_ID', 0, LIMITS.leagueId),
      matchId: read('MATCH_ID'),
      pollMs: number('POLL_MS', DEFAULTS.pollMs, LIMITS.pollMs),
      frameMs: number('FRAME_MS', DEFAULTS.frameMs, LIMITS.frameMs),
      requestTimeoutMs: number(
        'REQUEST_TIMEOUT_MS',
        DEFAULTS.requestTimeoutMs,
        LIMITS.requestTimeoutMs,
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
      banPortraits: read('BAN_PORTRAITS') !== '0',
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
