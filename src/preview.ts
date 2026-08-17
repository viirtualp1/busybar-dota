#!/usr/bin/env node
/**
 * Screenshots both displays without a BUSY Bar.
 *
 * Why this exists: the community emulator and busy-lib's own ScreenRenderer both
 * cover the front display only — the back OLED is a roadmap item in each — and
 * the renderer is canvas-bound anyway. The back display is exactly where the
 * roster and draft live, so it needs its own preview.
 *
 *   npm run shot            one frame of the synthetic match
 *   npm run shot -- --live  one frame of whatever is actually live
 *   npm run shot -- --draft the draft phase specifically
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { backElements, frontElements } from './bar/elements.js';
import { BACK } from './bar/layout.js';
import { loadConfig, loadEnvFile } from './config.js';
import { HeroCatalog } from './dota/heroes.js';
import { createScheduleSource, DemoScheduleSource } from './dota/schedule/index.js';
import { createSource, DemoSource } from './dota/source.js';
import { detectEvent, stateOf, type MatchEvent } from './domain/events.js';
import { idleSnapshot, type MatchSnapshot } from './dota/types.js';
import { RESULT_SCREEN_MS, type SeriesBreak } from './domain/series.js';
import { buildFrame, type DotaFrame } from './view/frame.js';
import { renderBack, renderFront } from './preview/raster.js';

const SCALE = 8;
/** 29.4 game minutes at the demo's 20x speed: the moment the mid racks fall. */
const EVENT_SEEK_MS = ((29.4 * 60 + 60) / 20) * 1000;
/** Far enough into the ticker that a scrolling line has started moving. */
const TICKER_ELAPSED_MS = 0;

loadEnvFile();
const { config } = loadConfig();
const argv = process.argv.slice(2);
const live = argv.includes('--live');
const draftOnly = argv.includes('--draft');
const upcoming = argv.includes('--upcoming');
const breakOnly = argv.includes('--break');
const eventShot = argv.includes('--event');
const resultShot = argv.includes('--result');

const heroes = new HeroCatalog();
if (!(await heroes.load())) {
  console.warn('Hero names unavailable — the shot will show hero ids');
}

const snapshot = await capture();
const frame = buildFrame(snapshot, {
  heroes,
  maxRows: BACK.maxRows,
  ticker: await captureEvent(),
  nowEpochMs: Date.now(),
  // `--upcoming` forces the between-games view; otherwise it appears whenever
  // nothing is live and a schedule source has something to say.
  schedule:
    upcoming || breakOnly || resultShot || !snapshot.live ? await captureSchedule() : null,
  seriesBreak: breakOnly || resultShot ? demoBreak() : null,
  idleNote: 'nothing live right now',
});

const front = renderFront(frontElements(frame)).scale(SCALE);
const back = renderBack(backElements(frame)).scale(SCALE);
write('preview-front.png', front.toPng());
write('preview-back.png', back.toPng());

printAscii(frame);

/**
 * Reruns the detector across the two polls either side of the seek point, so a
 * screenshot can show a real ticker line rather than a made-up one.
 */
async function captureEvent(): Promise<{ event: MatchEvent; elapsedMs: number } | null> {
  if (!eventShot) {
    return null;
  }
  const before = (await new DemoSource(Date.now() - EVENT_SEEK_MS + 5000).poll()) ?? idleSnapshot();
  const after = (await new DemoSource(Date.now() - EVENT_SEEK_MS).poll()) ?? idleSnapshot();
  const event = detectEvent(stateOf(before), after).event;
  // A moment into the scroll, so a long line is caught mid-travel rather than
  // always at its first frame.
  return event ? { event, elapsedMs: TICKER_ELAPSED_MS } : null;
}

/** A plausible mid-series pause, for the `--break` screenshot. */
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
    // Backdated past the result screen, so `--break` shows the countdown view
    // and `--result` shows the two-minute takeover.
    startedAtMs: resultShot ? Date.now() : Date.now() - RESULT_SCREEN_MS - 1000,
  };
}

async function capture(): Promise<MatchSnapshot> {
  if (upcoming || breakOnly || resultShot) {
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

  // Seek two seconds in for a draft that is underway, twenty for a game in
  // full swing, or straight to the barracks falling for an event shot.
  const seekMs = draftOnly ? 2000 : eventShot ? EVENT_SEEK_MS : 20_000;
  const demo = new DemoSource(Date.now() - seekMs);
  return (await demo.poll()) ?? idleSnapshot();
}

/**
 * Prefers the configured schedule source, so a screenshot shows the real
 * `schedule.json`. Falls back to the demo one, because a preview that renders
 * nothing teaches nothing.
 */
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

function write(name: string, data: Buffer): void {
  const path = resolve(process.cwd(), name);
  writeFileSync(path, data);
  console.log(`wrote ${path}`);
}

function printAscii(current: DotaFrame): void {
  console.log(`\n[${current.mode}]`);
  console.log('--- front 72x16 ---');
  console.log(
    `  ${current.radiantTag} [${current.scoreText}] ${current.direTag}` +
      // The ticker owns the bottom row while it runs, so show what is really there.
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
