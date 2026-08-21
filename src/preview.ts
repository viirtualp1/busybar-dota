#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { backElements, frontElements } from './bar/elements';
import { BACK } from './bar/layout';
import { loadConfig, loadEnvFile } from './config';
import { HeroCatalog } from './dota/heroes';
import { LeagueCatalog } from './dota/leagues';
import { PortraitStore } from './dota/portraits';
import { createScheduleSource, DemoScheduleSource } from './dota/schedule/index';
import { createSource, DemoSource } from './dota/source';
import { detectEvent, stateOf, type MatchEvent } from './domain/events';
import { idleSnapshot, type MatchSnapshot } from './dota/types';
import { RESULT_SCREEN_MS, type SeriesBreak } from './domain/series';
import { buildFrame, type DotaFrame } from './view/frame';
import { renderBack, renderFront } from './preview/raster';

const SCALE = 8;

const EVENT_SEEK_MS = ((29.4 * 60 + 60) / 20) * 1000;

const TICKER_ELAPSED_MS = 0;

loadEnvFile();
const { config } = loadConfig();
const argv = process.argv.slice(2);
const live = argv.includes('--live');
const draftOnly = argv.includes('--draft');
const banShot = argv.includes('--bans');
const upcoming = argv.includes('--upcoming');
const breakOnly = argv.includes('--break');
const idleShot = argv.includes('--idle');
const eventShot = argv.includes('--event');
const resultShot = argv.includes('--result');

const heroes = new HeroCatalog(config.steamApiKey);
if (!(await heroes.load())) {
  console.warn('Hero names unavailable — the shot will show hero ids');
}

const leagues = new LeagueCatalog();
await leagues.load(config.leagueId, config.requestTimeoutMs);

const snapshot = await capture();
// Nothing is uploaded here: the store keeps the bitmaps and the raster draws them.
const portraits = new PortraitStore(heroes, () => Promise.resolve());
if (config.banPortraits) {
  await portraits.prepare([...snapshot.radiant.draft.bans, ...snapshot.dire.draft.bans]);
}

const frame = buildFrame(snapshot, {
  heroes,
  maxRows: BACK.maxRows,
  ticker: await captureEvent(),
  nowEpochMs: Date.now(),
  portraits: portraits.ready,
  leagueName: leagues.name,

  schedule:
    !idleShot && (upcoming || breakOnly || resultShot || !snapshot.live)
      ? await captureSchedule()
      : null,
  seriesBreak: !idleShot && (breakOnly || resultShot) ? demoBreak() : null,
  idleNote: 'nothing live right now',
  tickerStyle: config.tickerStyle,
  tickerChars: config.tickerChars,
});

const front = renderFront(frontElements(frame)).scale(SCALE);
const back = renderBack(backElements(frame), (path) =>
  portraits.image(heroIdOf(path)),
).scale(SCALE);
write('preview-front.png', front.toPng());
write('preview-back.png', back.toPng());

printAscii(frame);

function heroIdOf(path: string) {
  return Number(path.replace(/\D+/g, ''));
}

async function captureEvent(): Promise<{ event: MatchEvent; elapsedMs: number } | null> {
  if (!eventShot) {
    return null;
  }
  const before =
    (await new DemoSource(Date.now() - EVENT_SEEK_MS + 5000).poll()) ?? idleSnapshot();
  const after =
    (await new DemoSource(Date.now() - EVENT_SEEK_MS).poll()) ?? idleSnapshot();
  const event = detectEvent(stateOf(before), after, (id) => heroes.name(id)).event;

  return event ? { event, elapsedMs: TICKER_ELAPSED_MS } : null;
}

function demoBreak(): SeriesBreak {
  return {
    radiantName: 'Team Spirit',
    direName: 'Falcons',
    radiantTag: 'TS',
    direTag: 'FLC',
    radiantWins: 1,
    direWins: 0,
    nextGame: 2,
    winsNeeded: 2,
    lastMatchId: 'demo',
    pendingResult: false,
    lastWinner: 'radiant',

    startedAtMs: resultShot ? Date.now() : Date.now() - RESULT_SCREEN_MS - 1000,
  };
}

async function capture(): Promise<MatchSnapshot> {
  if (upcoming || breakOnly || resultShot || idleShot) {
    return idleSnapshot();
  }

  if (live) {
    const source = createSource(
      {
        steamApiKey: config.steamApiKey,
        leagueId: config.leagueId,
        matchId: config.matchId,
        timeoutMs: config.requestTimeoutMs,
      },
      false,
    );
    console.log(`Source: ${source.label}`);
    try {
      return (await source.poll()) ?? idleSnapshot();
    } catch (error) {
      console.warn(
        `Live poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return idleSnapshot();
    }
  }

  const seekMs = banShot ? 2950 : draftOnly ? 2000 : eventShot ? EVENT_SEEK_MS : 20_000;
  const demo = new DemoSource(Date.now() - seekMs);

  return (await demo.poll()) ?? idleSnapshot();
}

async function captureSchedule() {
  const source = createScheduleSource({
    kind: config.scheduleKind,
    file: config.scheduleFile,
    stratzToken: config.stratzToken,
    leagueId: config.leagueId,
    timeoutMs: config.requestTimeoutMs,
  });
  try {
    const real = await source.poll();
    if (real?.next) {
      console.log(`Schedule: ${source.label}`);

      return real;
    }
  } catch (error) {
    console.warn(
      `Schedule source failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.log('Schedule: demo (no configured source had a next match)');

  return new DemoScheduleSource().poll();
}

function write(name: string, data: Buffer) {
  const path = resolve(process.cwd(), name);
  writeFileSync(path, data);
  console.log(`wrote ${path}`);
}

function printAscii(current: DotaFrame) {
  console.log(`\n[${current.mode}]`);
  console.log('--- front 72x16 ---');
  console.log(
    `  ${current.radiantTag} [${current.scoreText}] ${current.direTag}` +
      (current.tickerText
        ? `   ticker: ${current.tickerText}`
        : `   ${current.clockText}  ${current.seriesText}`),
  );
  console.log(
    `  net worth bar: ${'#'.repeat(Math.round(current.radiantFill / 3))}${'.'.repeat(24 - Math.round(current.radiantFill / 3))}  (${current.radiantFill}/72px radiant)`,
  );
  console.log('--- back 160x80 ---');
  console.log(`  ${current.backHeader}`);
  console.log(`  ${current.backSub}`);
  for (const row of current.backRows) {
    if (row.kind === 'wide') {
      console.log(`  ${row.highlight ? '>' : ' '} ${row.label.padEnd(7)}${row.text}`);
      continue;
    }
    const left = `${row.left?.hero ?? ''} ${row.left?.stats ?? ''}`.trim();
    const right = `${row.right?.hero ?? ''} ${row.right?.stats ?? ''}`.trim();
    console.log(`  ${left.padEnd(18)}| ${right}`);
  }
}
