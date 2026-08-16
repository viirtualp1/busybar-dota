#!/usr/bin/env node
import { App } from './app.js';
import { BarDisplay, createBusyBar } from './bar/display.js';
import { errorMessage } from './bar/errors.js';
import { loadConfig, loadEnvFile } from './config.js';
import { HeroCatalog } from './dota/heroes.js';
import { createScheduleSource } from './dota/schedule/index.js';
import { createSource } from './dota/source.js';

loadEnvFile();
const { config, warnings } = loadConfig();

const source = createSource(
  {
    steamApiKey: config.steamApiKey,
    leagueId: config.leagueId,
    matchId: config.matchId,
    timeoutMs: config.requestTimeoutMs,
  },
  config.demo,
);

// No keyless API publishes a pro schedule — Valve's GetScheduledLeagueGames is
// gone — so the between-games view is opt-in rather than silently absent.
const schedule = createScheduleSource({
  kind: config.scheduleKind,
  file: config.scheduleFile,
  stratzToken: config.stratzToken,
  leagueId: config.leagueId,
  timeoutMs: config.requestTimeoutMs,
});

console.log('busybar-dota');
console.log(`Source: ${source.label}`);
console.log(`Schedule: ${schedule.label}`);
if (config.leagueId) {
  console.log(`League filter: ${config.leagueId}`);
}
for (const warning of warnings) {
  console.warn(warning);
}

const bar = createBusyBar({
  addr: config.busyAddr,
  token: config.busyToken,
  httpPassword: config.busyHttpPassword,
});
const app = new App({
  config,
  source,
  schedule,
  heroes: new HeroCatalog(),
  display: new BarDisplay(bar, config.drawPriority),
});

let exiting = false;
async function shutdown(code: number): Promise<void> {
  if (exiting) {
    return;
  }
  exiting = true;
  await app.stop();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
process.on('unhandledRejection', (reason) => {
  console.warn(`Unhandled rejection: ${errorMessage(reason)}`);
});
process.on('uncaughtException', (error) => {
  console.error(`Fatal: ${errorMessage(error)}`);
  void shutdown(1);
});

await app.start();
await app.wait();
