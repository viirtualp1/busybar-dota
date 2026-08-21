# busybar-dota

Live Dota 2 pro matches on a [BUSY Bar](https://busy.app/).

## What it shows

**Front (72×16)** — the display itself is the net worth bar: Radiant green from
the left, Dire red from the right.

- Kill score in the middle, team tags in the corners
- Game clock bottom left, series score in the middle, gold lead bottom right
- Roshan countdown replaces the series score while he is dead — `R6:00`
- Tower, barracks and Roshan events take the bottom row for a few seconds, with
  an LED flash and a sound. Kills are silent
- Lines too long for the row are shown in chunks, 2.2s each

**Back (160×80)**

- Team names, gold lead, standing towers and the Roshan countdown
- Five rows a side: hero and K/D/A, switching to player nickname and net worth
  every three seconds
- **During the draft** the five slots fill in with heroes as the picks land.
  Once both drafts are full the bans replace them as a grid of hero portraits

**Between games** — countdown to the next match, the matchup, and the rest of
the day's schedule with start times in your local zone.

**When a game ends** — two minutes of the result: both tags with the winner in a
filled block and the series score between them.

**Standby** — the tournament name: shortened on the front (`The International
2026` becomes `TI 2026`), spelled out on the back. It is looked up from the
league of the game being followed, or from `LEAGUE_ID`. Without one the front
just says `DOTA`.

## Setup

Needs Node.js 22+ and a BUSY Bar on USB, Wi-Fi or cloud.

```bash
npm install
cp .env.example .env
npm run dev
```

Leave the Bar on a BUSY or CUSTOM session, otherwise its own session outranks
the draws (see `DRAW_PRIORITY`).

A free [Steam API key](https://steamcommunity.com/dev/apikey) is optional but
worth it:

|                  | Steam `GetLiveLeagueGames` | OpenDota `/live` |
| ---------------- | -------------------------- | ---------------- |
| Key              | free key required          | none             |
| Per-player K/D/A | yes                        | no               |
| Picks and bans   | yes                        | no               |
| Nicknames        | yes                        | sometimes        |
| Series score     | yes                        | no               |

Without `LEAGUE_ID` or `MATCH_ID` it follows whichever pro game has the most
spectators.

## Trying it without a live match

```bash
npm run demo                # a synthetic 30-minute match at 20x
npm run shot                # screenshots: mid-game
npm run shot -- --draft     # the draft filling up
npm run shot -- --bans      # the ban portraits
npm run shot -- --upcoming  # the countdown between matches
npm run shot -- --break     # the pause inside a series
npm run shot -- --event     # the event ticker
npm run shot -- --result    # the winner screen
npm run shot -- --idle      # the standby screen
npm run shot -- --live      # whatever is live right now
```

`npm run shot` writes `preview-front.png` and `preview-back.png` at 8× and
prints the same frame as text. The glyphs are approximations of the device
fonts, and the back panel is flattened to its 16 greys.

## Schedule

The countdown and the match list come from a file you maintain:

```bash
cp schedule.example.json schedule.json
npm run schedule:check
```

```json
{
  "timezone": "Asia/Shanghai",
  "date": "2026-08-20",
  "matches": [
    { "teams": "IW vs TSpirit", "time": "10:00", "stage": "Upper Bracket QF", "bo": 3 },
    { "teams": "VISION vs BB", "time": "13:00", "stage": "Upper Bracket QF", "bo": 3 }
  ]
}
```

- `timezone` and `date` are set once; each match is a wall-clock time in that zone
- Add `"score": "2-0"` to a match when it finishes and it drops out of the countdown
- The file is re-read whenever it changes
- `npm run schedule:check` prints it in both tournament and local time

`SCHEDULE_SOURCE=stratz` with a `STRATZ_TOKEN` reads brackets from STRATZ
instead. The query has never run against a live token — check it with
`npm run stratz:check` before trusting it.

## Configuration

| Variable             | Default         | Notes                                                               |
| -------------------- | --------------- | ------------------------------------------------------------------- |
| `BUSY_ADDR`          | `10.0.4.20`     | USB address; Bar LAN IP for Wi-Fi; `https://api.busy.app` for cloud |
| `BUSY_TOKEN`         | —               | cloud only                                                          |
| `BUSY_HTTP_PASSWORD` | —               | Wi-Fi only (Bar web UI → Network → HTTP API access)                 |
| `STEAM_API_KEY`      | —               | unlocks per-player stats, picks and bans                            |
| `LEAGUE_ID`          | —               | pin to one tournament                                               |
| `MATCH_ID`           | —               | pin to one game                                                     |
| `SOUNDS`             | `1`             | `0` mutes event sounds                                              |
| `BAN_PORTRAITS`      | `1`             | `0` keeps the bans as text                                          |
| `TICKER_STYLE`       | `page`          | `scroll` moves long lines instead of paging them                    |
| `TICKER_CHARS`       | `17`            | glyphs assumed to fit one front row; raise if lines page too soon   |
| `POLL_MS`            | `5000`          | how often the upstream is polled                                    |
| `FRAME_MS`           | `200`           | redraw cadence                                                      |
| `DRAW_PRIORITY`      | `40`            |                                                                     |
| `SCHEDULE_SOURCE`    | auto            | `json` / `stratz` / `demo` / `none`                                 |
| `SCHEDULE_FILE`      | `schedule.json` | schedule file path                                                  |
| `STRATZ_TOKEN`       | —               | required by `SCHEDULE_SOURCE=stratz`                                |
| `DEMO`               | —               | `1` for the synthetic match                                         |

Both sources carry the tournament's broadcast delay, so the bar is in sync with
the stream, roughly two minutes behind the players.
