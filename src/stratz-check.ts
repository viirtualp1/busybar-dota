#!/usr/bin/env node
import { loadConfig, loadEnvFile } from './config';
import { LEAGUE_QUERY, StratzScheduleSource } from './dota/schedule/index';

loadEnvFile();
const { config } = loadConfig();

if (!config.stratzToken) {
  console.error('STRATZ_TOKEN is not set. Put it in .env or pass it inline.');
  process.exit(1);
}

if (!config.leagueId) {
  console.error('LEAGUE_ID is not set — the query needs a league to ask about.');
  process.exit(1);
}

const source = new StratzScheduleSource({
  token: config.stratzToken,
  leagueId: config.leagueId,
  timeoutMs: config.requestTimeoutMs,
});

console.log(`league ${config.leagueId}\n`);
console.log(LEAGUE_QUERY);
console.log('\n--- raw response ---');

try {
  const body = await source.request();
  console.log(JSON.stringify(body, null, 2).slice(0, 4000));
} catch (error) {
  console.error(
    `\nrequest failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error(
    'A 403 here is either a bad token or Cloudflare refusing a server-side call.',
  );
  process.exit(1);
}

console.log('\n--- as parsed ---');
try {
  const schedule = await source.poll();
  if (!schedule) {
    console.log('parsed to nothing — the field names below are the ones to check:');
    console.log('  data.league.nodeGroups[].nodes[]');
    process.exit(1);
  }
  console.log(`next: ${schedule.next?.teamA ?? '?'} vs ${schedule.next?.teamB ?? '?'}`);
  console.log(`starts: ${schedule.next?.startsAtMs ?? 'TBD'}`);
  for (const row of schedule.bracket.slice(0, 10)) {
    console.log(`  ${row.label.padEnd(8)}${row.text}`);
  }
} catch (error) {
  console.error(
    `parse failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
