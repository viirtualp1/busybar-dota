import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SteamSource } from '../src/dota/steam';
import { asciiName } from '../src/dota/types';

const GAME = {
  match_id: 8957405825,
  league_id: 19719,
  spectators: 1000,
  series_type: 1,
  radiant_series_wins: 1,
  dire_series_wins: 0,
  radiant_team: { team_name: 'Team Spirit' },
  dire_team: { team_name: 'Falcons' },
  // Nicknames only ever arrive here, alongside casters and observers.
  players: [
    { account_id: 111, name: 'Yatoro', hero_id: 40, team: 0 },
    { account_id: 222, name: 'Larl', hero_id: 15, team: 0 },
    { account_id: 333, name: 'skiter', hero_id: 55, team: 1 },
    { account_id: 999, name: 'SomeCaster', hero_id: 0, team: 4 },
  ],
  scoreboard: {
    duration: 443.5,
    radiant: {
      score: 12,
      tower_state: 2047,
      barracks_state: 63,
      picks: [{ hero_id: 40 }, { hero_id: 15 }],
      bans: [{ hero_id: 56 }],
      // The scoreboard roster has the stats and no name field at all.
      players: [
        { player_slot: 0, account_id: 111, hero_id: 40, kills: 2, death: 0, assists: 1 },
        { player_slot: 1, account_id: 222, hero_id: 15, kills: 1, death: 2, assists: 3 },
      ],
    },
    dire: {
      score: 8,
      tower_state: 2047,
      barracks_state: 63,
      picks: [{ hero_id: 55 }],
      bans: [{ hero_id: 32 }],
      players: [
        {
          player_slot: 128,
          account_id: 333,
          hero_id: 55,
          kills: 0,
          death: 1,
          assists: 0,
        },
      ],
    },
  },
};

function source(game: unknown) {
  return new SteamSource(
    { apiKey: 'key', leagueId: 0, matchId: '', timeoutMs: 1000 },
    () => Promise.resolve(new Response(JSON.stringify({ result: { games: [game] } }))),
  );
}

test('player nicknames are joined onto the scoreboard by account id', async () => {
  const snapshot = await source(GAME).poll();
  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.radiant.players.map((player) => player.name),
    ['Yatoro', 'Larl'],
  );
  assert.deepEqual(
    snapshot.dire.players.map((player) => player.name),
    ['skiter'],
  );
});

test('a player the roster does not name is left blank, not mispaired', async () => {
  const stranger = structuredClone(GAME);
  stranger.players = stranger.players.filter((player) => player.account_id !== 222);
  const snapshot = await source(stranger).poll();

  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.radiant.players.map((player) => player.name),
    ['Yatoro', ''],
  );
});

test('nicknames the bar fonts cannot draw fall back to the hero name', () => {
  assert.equal(asciiName('Yatoro'), 'Yatoro');
  assert.equal(asciiName('Cr1t-'), 'Cr1t-');
  assert.equal(asciiName('蜡笔新新儿'), '');
  assert.equal(asciiName('  Msééting  '), 'Msting');
});
