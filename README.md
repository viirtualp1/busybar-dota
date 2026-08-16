# busybar-dota

Live Dota 2 pro matches on a [BUSY Bar](https://busy.app/). Built for The
International, works for any pro game.

## What you get

**Front — the front display _is_ the net worth bar**

The 72 pixels are split between the two teams by gold: Radiant green from the
left, Dire red from the right, kill score in bold on top. You read who is
winning from across the room without reading a single number.

- Kill score, big and centred
- Team tags in their side's colour
- Game clock (negative during the pre-horn countdown, like the game itself)
- Series score on the right
- LED flash on kills and tower falls, coloured by which team scored

**Back**

- Both team names, net worth lead and standing towers
- Five rows, Radiant on the left and Dire on the right: hero + K/D/A
- **During the draft** the same rows show picks in draft order, and the subtitle
  shows the ban count plus each side's most recent ban. The front clock reads
  `DRAFT` instead of counting down to a horn that has not been scheduled yet.

## Requirements

- Node.js 22+
- BUSY Bar on USB, Wi-Fi or cloud
- Optional: a free [Steam Web API key](https://steamcommunity.com/dev/apikey)

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Leave the Bar on a BUSY / CUSTOM session, or its own session outranks the draws
(see `DRAW_PRIORITY`).

### There is no live match right now

Games only run during the tournament's local daytime, which is a poor
development loop. Run a synthetic match instead:

```bash
npm run demo
```

It plays a full 40-minute game in two minutes, starting from a draft, and
deliberately swings the net worth lead across zero so both colours and every
event path get exercised.

### Screenshots without a Bar

```bash
npm run shot            # the synthetic match, mid-game
npm run shot -- --draft # the draft phase
npm run shot -- --live  # whatever is actually live right now
```

Writes `preview-front.png` (72×16) and `preview-back.png` (160×80), scaled 8×
with square pixels, and prints the same frame as text.

It rasterises the _same element array_ that goes over the wire, so a layout bug
appears here exactly as it would on hardware — with two deliberate caveats:

- **Glyphs are approximate.** The Bar renders real TTFs baked to a glyph atlas
  and there is no way to reach those from Node, so the preview uses a built-in
  3×5 font and renders everything upper case. It will tell you that a column
  overflows or that the wrong value is on screen; it will not tell you that a
  letter is a pixel narrower on hardware.
- **The back display is flattened to 16 greys**, because that is what the panel
  is. This is the point, not a shortcut: it is what showed that Radiant green and
  Dire red collapse into two nearly identical greys on the back, which is why the
  rosters are separated by a divider rule instead of by colour.

For pixel-exact _front_ rendering there is the community
[busybar-emulator](https://github.com/maxswinkels/busybar-emulator), which
speaks the same HTTP API with the device's real fonts — point `BUSY_ADDR` at it.
It does not implement the back display, which is the half this preview exists
for. busy-lib ships a `ScreenRenderer` with the same limitation, and it is
canvas-bound so it will not run in Node at all.

## Data sources

Two upstreams, picked automatically:

|                  | Steam `GetLiveLeagueGames` | OpenDota `/live` |
| ---------------- | -------------------------- | ---------------- |
| Key              | free key required          | none             |
| Per-player K/D/A | yes                        | no               |
| Picks and bans   | yes                        | no               |
| Tower state      | yes                        | yes              |
| Series score     | yes                        | no               |

Set `STEAM_API_KEY` for the full back display. Without it the app falls back to
OpenDota and the roster shows heroes only — the front display is identical
either way.

With no `LEAGUE_ID` or `MATCH_ID` set, it follows whichever pro game has the
most spectators. During TI that is reliably the main stage, which is why it is
the default rather than a hardcoded league id that goes stale every year.

Hero names come from OpenDota at startup rather than a vendored table: the
roster grows every patch, and a stale table shows `#145` for exactly the heroes
a new patch's tournament is about. If that request fails the display degrades to
hero ids instead of refusing to start.

## Configuration

| Variable             | Default     | Notes                                                               |
| -------------------- | ----------- | ------------------------------------------------------------------- |
| `BUSY_ADDR`          | `10.0.4.20` | USB address; Bar LAN IP for Wi-Fi; `https://api.busy.app` for cloud |
| `BUSY_TOKEN`         | —           | cloud only                                                          |
| `BUSY_HTTP_PASSWORD` | —           | Wi-Fi only (Bar web UI → Network → HTTP API access)                 |
| `STEAM_API_KEY`      | —           | unlocks per-player stats                                            |
| `LEAGUE_ID`          | —           | pin to one tournament                                               |
| `MATCH_ID`           | —           | pin to one game                                                     |
| `POLL_MS`            | `5000`      | upstreams refresh every few seconds                                 |
| `FRAME_MS`           | `200`       | redraw cadence                                                      |
| `DRAW_PRIORITY`      | `40`        |                                                                     |
| `DEMO`               | —           | `1` for the synthetic match                                         |

## Notes

**You are watching the past.** Both sources carry the tournament's broadcast
delay, typically two minutes. The bar is in sync with the stream, not with the
players.

**Polling is deliberately slow.** OpenDota allows 60 requests a minute and the
upstream numbers only change every few seconds, so a faster poll would spend
quota to redraw identical frames. The render loop runs independently and much
faster, so LED flashes stay crisp.

**Upstream hiccups keep the last frame.** A failed poll leaves the previous
numbers on screen rather than blanking the display — slightly stale beats empty.

## Things worth building next

- Bans as a grid of hero portraits instead of a count plus the latest two — the
  back display has the room once picks are done
- Roshan timer — the Steam scoreboard has `roshan_respawn_timer`
- Sound on tower falls, using the stock sounds the way busybar-livesplit does
- Per-player net worth bars instead of plain K/D/A text
