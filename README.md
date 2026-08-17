# busybar-dota

Live Dota 2 pro matches on a [BUSY Bar](https://busy.app/). Built for The
International, works for any pro game.

## What you get

**Front — the front display _is_ the net worth bar**

The 72 pixels are split between the two teams **by net worth, not by the kill
score** — Radiant green from the left, Dire red from the right, kills in bold on
top. So a 1-1 game with a 3k gold lead shows a green-heavy bar, and that is the
point: you read who is actually winning from across the room without reading a
single number.

- Kill score, big and centred, with the series score directly beneath it
- Team tags in their side's colour
- Game clock (negative during the pre-horn countdown, like the game itself)
- **Who is ahead on gold, bottom right** — `+9.6k`, coloured green or red for
  the side that is ahead. No team tag: it would collide with the centred series
  score, and colour is what the front panel is for. Blank under 500 gold, since
  a number that flips teams every poll is worse than no number
- **Event ticker**: when a tower, barracks or Roshan goes down, the bottom row
  hands itself over — `FLC lost mid tier 2 tower`, `Roshan killed, respawns in
9 min` — with an LED flash and a sound, then gives the clock back. Anything
  too long to fit **scrolls** rather than being abbreviated: `FAL MID RAX` saved
  pixels and lost the meaning. Kills appear silently, because there are dozens
  of them and one chirp each is a machine gun.

**Long lines page, they do not scroll**

Nothing is abbreviated any more — `FAL MID RAX` saved pixels and lost the
meaning — so anything past seventeen glyphs has to be shown over time. It is
broken on word boundaries and each chunk holds still for 2.2 seconds.

How many glyphs fit is a guess — the device fonts are proportional and this code
cannot measure them, so it budgets 4px each and gets 17. `TICKER_CHARS` raises
that if lines page when they plainly had room to sit still.

Scrolling was tried first and read badly, for a reason worth writing down: the
display redraws about five times a second. A step small enough to look smooth is
one pixel, which crawls at 5px/s; a step fast enough to finish a sentence moves a
whole 4px glyph at a time, which reads as a stutter rather than motion. The
original 180ms step against a 200ms redraw was not even a whole multiple, so
steps landed on alternating frames and visibly jittered. `TICKER_STYLE=scroll`
brings the moving line back, now with its step aligned to the redraw.

**Back**

- Both team names, net worth lead and standing towers
- Five rows, Radiant on the left and Dire on the right: hero + K/D/A. The name
  **alternates between hero and player every three seconds**, because the row has
  space for one and you want both.
- The sub-line carries the full event while the ticker runs — `FAL lost mid
barracks` — since there is room for the detail the front cannot fit.
- **During the draft** the same rows show picks in draft order, and the subtitle
  shows the ban count plus each side's most recent ban. The front clock reads
  `DRAFT` instead of counting down to a horn that has not been scheduled yet.

**When a game ends** — the result takes the screen

For two minutes the display is only about who won: both tags in bold with a box
drawn around the winner, the series score between them, and nothing else. The
loser is dimmed rather than hidden, because you want to read the pairing. Then
the countdown comes back and the result keeps showing underneath it for the next
twenty minutes.

The winner is not in the live feed — a finished game simply stops being listed,
and the series score it carried was the score _going into_ that game. It is
resolved from OpenDota's `/matches/{id}`, which needs no key. Until that lands
the screen says `GAME OVER` and `result pending` rather than guessing.

**Between games** — countdown, start time and bracket

When nothing is live, the same slots switch meaning rather than going blank: the
score becomes a countdown to the next match and the row beneath it carries the
matchup in **full team names**, scrolling if they do not fit. Abbreviated tags
belong to a running game, where the two halves of the bar say which is which;
while waiting there is nothing to decode them against. The back display carries
the date, time and series length, plus the bracket with the upcoming tie marked
`>` and the rest dimmed.

The round label in the bracket only appears when the round _changes_ — four
quarterfinals in a row do not each need to say `UBQ`, and dropping the
repetition gives the team names the width instead.

This needs a schedule source, and there is not a free one — see below.

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

It plays a believable game rather than a stress test: a draft, then thirty
minutes ending 17-12, towers falling in a plausible order, Roshan twice, mid
barracks right at the end, and then the game stops being live so the
between-games view gets exercised too. The whole thing runs in about a minute
and a half at 20x.

### Screenshots without a Bar

```bash
npm run shot               # the synthetic match, mid-game
npm run shot -- --draft    # the draft phase
npm run shot -- --upcoming # the between-games countdown and bracket
npm run shot -- --break    # the pause between games of a series
npm run shot -- --event    # the ticker, caught on the barracks falling
npm run shot -- --live     # whatever is actually live right now
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

### Schedules and brackets: a hand-maintained file, for now

Valve's `GetScheduledLeagueGames` is **gone** — it returns 404, as does
`GetLeagueListing`. Nothing keyless publishes a pro schedule or bracket, and the
paid-or-invite options are all blocked right now: Liquipedia moved brackets off
its basic tier, and STRATZ token signup is broken. So there are two sources:

**`json` — a file you maintain (the default, and what actually works today)**

```bash
cp schedule.example.json schedule.json
npm run schedule:check
```

The format is built around the thing that actually costs time: converting
tournament times into your own. It does not ask you to.

```json
{
  "timezone": "Asia/Shanghai",
  "date": "2026-08-20",
  "matches": [
    {
      "teams": "IW vs TSpirit",
      "time": "10:00",
      "stage": "Upper Bracket Quarterfinals",
      "bo": 3
    },
    {
      "teams": "VISION vs BB",
      "time": "13:00",
      "stage": "Upper Bracket Quarterfinals",
      "bo": 3
    }
  ]
}
```

- **`timezone` and `date` are set once per file.** Set `timezone` to whatever
  zone your source _displays_, not the tournament's — Liquipedia converts times
  to your own zone when you are logged in, so copying what you see is usually
  right. Then each match is just a wall-clock time and there is nothing to
  convert at all. Zone names resolve through `Intl`, so DST is handled rather
  than approximated by a fixed offset.
- **`teams` is one field.** `"IW vs TSpirit"`, not a `teamA`/`teamB` pair. Tags
  and the short stage label (`Upper Bracket R2` → `UB2`) are derived.
- **The bracket is derived from the matches**, so there is one list to keep
  straight instead of two that have to agree. Supply a `bracket` array only to
  override it.
- **Finishing a match is one edit**: add `"score": "2-0"`. It drops out of the
  countdown and shows its result in the bracket.
- The file is re-read whenever it changes, so you can edit it while the app runs.

`npm run schedule:check` prints the parsed file with tournament time and your
local time side by side:

```
  Asia/Shanghai         Asia/Tbilisi          in        stage   match
> 20 Aug, 10:00         20 Aug, 06:00         3d 13h    UBQ     IW vs TSpirit  BO3
  20 Aug, 13:00         20 Aug, 09:00         3d 16h    UBQ     VISION vs BB  BO3
```

That column pair exists because the failure mode of a hand-written schedule is a
time that is off by a timezone: it looks perfectly fine in the file and only
shows up hours later as a countdown to the wrong thing. When the file's zone is
already your own, the second column is dropped and it says so.

Bad files fail loudly and name the field: `matches[2].time "lunchtime" is not a
time I can read (expected HH:MM)`. A mistyped zone is caught at load rather than
silently treated as UTC.

The longhand form (`teamA`, `teamB`, `startsAt` with a full ISO string) still
works for one-offs.

Note that **the bar shows start times in your local zone**, not the
tournament's — it is telling you when to be at your desk.

**`stratz` — ready, but switched off**

`SCHEDULE_SOURCE=stratz` with a `STRATZ_TOKEN` uses their GraphQL league
brackets. ⚠️ **The query is written to STRATZ's documented `League.nodeGroups`
schema but has never run against a live token**, because signup was broken when
it was written. Every field is read defensively, so a wrong name yields a blank
value rather than a crash — but it may well need a rename or two. The moment a
token works:

```bash
npm run stratz:check
```

That prints the query, the raw response and what the parser made of it, so a
schema mismatch is one glance away. `src/dota/schedule/stratz.ts` keeps the
query in a single constant for exactly this reason. Note also that
`api.stratz.com` sits behind Cloudflare, which may refuse server-side calls
regardless of the token.

For reference, the options and why they are not wired up:

| Source            | What it takes                     | Notes                                                                                                                       |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Liquipedia API v3 | free API key, requested from them | best data fit — matches, brackets, tournaments. Returns 403 without one, and their MediaWiki `api.php` is closed off (406). |
| STRATZ GraphQL    | free token                        | rich league/bracket schema, but the endpoint sits behind Cloudflare                                                         |
| PandaScore        | account, free tier unclear        | clean REST: `/matches/upcoming`, `/tournaments/{id}/brackets`                                                               |

So `ScheduleSource` is an interface (`src/dota/schedule.ts`) with a demo
implementation, and no real one is wired up yet. Without one the app shows the
plain idle screen — it will not invent a countdown.

Hero names come from OpenDota at startup rather than a vendored table: the
roster grows every patch, and a stale table shows `#145` for exactly the heroes
a new patch's tournament is about. If that request fails the display degrades to
hero ids instead of refusing to start.

## Configuration

| Variable             | Default         | Notes                                                               |
| -------------------- | --------------- | ------------------------------------------------------------------- |
| `BUSY_ADDR`          | `10.0.4.20`     | USB address; Bar LAN IP for Wi-Fi; `https://api.busy.app` for cloud |
| `BUSY_TOKEN`         | —               | cloud only                                                          |
| `BUSY_HTTP_PASSWORD` | —               | Wi-Fi only (Bar web UI → Network → HTTP API access)                 |
| `STEAM_API_KEY`      | —               | unlocks per-player stats                                            |
| `LEAGUE_ID`          | —               | pin to one tournament                                               |
| `MATCH_ID`           | —               | pin to one game                                                     |
| `POLL_MS`            | `5000`          | upstreams refresh every few seconds                                 |
| `FRAME_MS`           | `200`           | redraw cadence                                                      |
| `DRAW_PRIORITY`      | `40`            |                                                                     |
| `SCHEDULE_SOURCE`    | auto            | `json` / `stratz` / `demo` / `none`                                 |
| `SCHEDULE_FILE`      | `schedule.json` | hand-maintained schedule file                                       |
| `STRATZ_TOKEN`       | —               | required by `SCHEDULE_SOURCE=stratz`                                |
| `DEMO`               | —               | `1` for the synthetic match                                         |

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

## Changing the wording

Every sentence that reaches the display is in one block at the top of
[`src/domain/events.ts`](src/domain/events.ts) — `EVENT_TEXT` for the events
themselves and `BUILDING_WORDS` for how lanes and tiers are named. Nothing below
that block builds a sentence of its own, so rewording is a one-file edit.

Keep it plain ASCII. The Bar draws a placeholder box for glyphs its font lacks,
so an em dash or a middle dot arrives as a stray rectangle mid-sentence — which
is exactly what the first version did. A test walks every event and every drawn
line and fails on any character above ASCII 126.

## Things worth building next

- A Roshan _countdown_ on screen, not just the kill notice — the timer is already
  parsed
- Who killed whom: per-player kill and death counters are in the Steam
  scoreboard, but pairing them into "X killed Y" is guesswork when several land
  in one five-second poll, so only the team is reported today
- Bans as a grid of hero portraits — the back display has the room once picks are
  done, but it means uploading images to device assets on every change
- Per-player net worth bars instead of plain K/D/A text
