#!/usr/bin/env node
import { App } from './app';
import { BarDisplay, createBusyBar } from './bar/display';
import { errorMessage } from 'busybar-kit/errors';
import { loadConfig, loadEnvFile } from './config';
import { HeroCatalog } from './dota/heroes';
import { DemoResultLookup, MatchResultLookup } from './dota/match-result';
import { createScheduleSource } from './dota/schedule/index';
import { createSource } from './dota/source';

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

  results: config.demo
    ? new DemoResultLookup()
    : new MatchResultLookup(config.requestTimeoutMs),
  heroes: new HeroCatalog(),
  display: new BarDisplay(bar, config.drawPriority),
});

let exiting = false;
async function shutdown(code: number) {
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
