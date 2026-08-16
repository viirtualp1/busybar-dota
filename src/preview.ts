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
import { idleSnapshot, type MatchSnapshot } from './dota/types.js';
import { buildFrame, type DotaFrame } from './view/frame.js';
import { renderBack, renderFront } from './preview/raster.js';

const SCALE = 8;

loadEnvFile();
const { config } = loadConfig();
const argv = process.argv.slice(2);
const live = argv.includes('--live');
const draftOnly = argv.includes('--draft');
const upcoming = argv.includes('--upcoming');

const heroes = new HeroCatalog();
if (!(await heroes.load())) {
  console.warn('Hero names unavailable — the shot will show hero ids');
}

const snapshot = await capture();
const frame = buildFrame(snapshot, {
  heroes,
  maxRows: BACK.maxRows,
  flash: null,
  nowEpochMs: Date.now(),
  // `--upcoming` forces the between-games view; otherwise it appears whenever
  // nothing is live and a schedule source has something to say.
  schedule: upcoming || !snapshot.live ? await captureSchedule() : null,
  idleNote: 'nothing live right now',
});

const front = renderFront(frontElements(frame)).scale(SCALE);
const back = renderBack(backElements(frame)).scale(SCALE);
write('preview-front.png', front.toPng());
write('preview-back.png', back.toPng());

printAscii(frame);

async function capture(): Promise<MatchSnapshot> {
  if (upcoming) {
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

  // Seek two seconds in for a draft that is underway, or twenty for a game with
  // kills, towers and a net worth swing on the board.
  const seekMs = draftOnly ? 2000 : 20_000;
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
    `  ${current.radiantTag} [${current.scoreText}] ${current.direTag}   ${current.clockText}  ${current.seriesText}`,
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
