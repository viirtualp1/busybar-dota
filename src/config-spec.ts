import { defineConfigSpec, integerIn, matching, required } from 'busybar-kit/config-spec';

/** `06:00` — a wall-clock time in the file's own timezone. */
const wallClock = matching(/^\d{1,2}:\d{2}$/, 'a wall-clock time, like 06:00');

export default defineConfigSpec({
  name: 'dota',
  summary: 'The pro match that is live, and the bracket around it',
  sections: [
    {
      kind: 'list',
      file: 'schedule.json',
      title: 'Schedule',
      // The matches sit under a key, beside settings for the whole file — and
      // the `_comment` block explaining the format has to survive a write.
      at: 'matches',
      empty: 'No matches yet — copy one off Liquipedia.',
      header: [
        {
          key: 'timezone',
          label: 'Timezone the times are written in',
          type: 'text',
          placeholder: 'Asia/Tbilisi',
          hint: 'Whatever zone your source shows. IANA name or an offset',
          required: true,
          validate: required('A timezone'),
        },
        {
          key: 'date',
          label: 'Day these matches are on',
          type: 'text',
          placeholder: '2026-09-10',
          hint: 'The default for the file; a match can override it',
          validate: matching(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
        },
      ],
      summary: (entry) =>
        [entry.time, entry.teams, entry.stage, entry.bo ? `BO${entry.bo}` : '']
          .filter(Boolean)
          .join('  '),
      fields: [
        {
          key: 'teams',
          label: 'Teams',
          type: 'text',
          placeholder: 'Team Spirit vs Falcons',
          required: true,
          hint: 'One field. Tags are derived unless you set them',
          validate: required('Both teams'),
        },
        {
          key: 'time',
          label: 'Start time',
          type: 'text',
          placeholder: '06:00',
          required: true,
          hint: 'Wall clock, in the timezone set above',
          validate: wallClock,
        },
        {
          key: 'stage',
          label: 'Stage',
          type: 'text',
          placeholder: 'Upper Bracket R2',
          hint: 'The short label (UB2) is derived from this',
        },
        {
          key: 'bo',
          label: 'Best of',
          type: 'number',
          placeholder: '3',
          validate: integerIn(1, 7),
        },
        {
          key: 'date',
          label: 'Date, if not the file default',
          type: 'text',
          advanced: true,
          hint: 'For a late-night slot that rolls past midnight',
          validate: matching(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
        },
      ],
    },
    {
      kind: 'env',
      file: '.env',
      title: 'Settings',
      fields: [
        {
          key: 'STEAM_API_KEY',
          label: 'Steam API key',
          type: 'secret',
          hint: 'Without one there are no per-player stats. steamcommunity.com/dev/apikey',
        },
        {
          key: 'LEAGUE_ID',
          label: 'League to follow',
          type: 'number',
          placeholder: '18323',
          hint: '0 follows whatever is live',
          validate: integerIn(0, 100_000_000),
        },
        {
          key: 'SCHEDULE_SOURCE',
          label: 'Where the schedule comes from',
          type: 'select',
          fallback: 'json',
          options: [
            { value: 'json', label: 'json', hint: 'the file above' },
            { value: 'stratz', label: 'stratz', hint: 'live, needs a token' },
            { value: 'demo', label: 'demo', hint: 'synthetic' },
            { value: 'none', label: 'none' },
          ],
        },
        {
          key: 'STRATZ_TOKEN',
          label: 'Stratz token',
          type: 'secret',
          hint: 'Only for SCHEDULE_SOURCE=stratz',
        },
        {
          key: 'SOUNDS',
          label: 'Play a sound on big events',
          type: 'boolean',
          fallback: '1',
        },
        {
          key: 'TICKER_STYLE',
          label: 'How a long line moves',
          type: 'select',
          fallback: 'page',
          options: [
            { value: 'page', label: 'page', hint: 'a screenful at a time' },
            { value: 'scroll', label: 'scroll', hint: 'sliding sideways' },
          ],
        },
        {
          key: 'MATCH_ID',
          label: 'Pin one match',
          type: 'text',
          advanced: true,
          hint: 'Follows this match and nothing else',
        },
        {
          key: 'POLL_MS',
          label: 'How often the source is asked',
          type: 'number',
          advanced: true,
          validate: integerIn(2000, 60_000),
        },
        {
          key: 'TICKER_CHARS',
          label: 'Characters on the ticker line',
          type: 'number',
          advanced: true,
          validate: integerIn(8, 40),
        },
      ],
    },
  ],
});
