/**
 * Wall-clock time in a named zone → epoch milliseconds.
 *
 * The point of this file is that you never convert a tournament time by hand.
 * TI runs on Shanghai time; writing `"10:00"` with `"timezone": "Asia/Shanghai"`
 * beats working out what that is where you are, at midnight, twice a day.
 *
 * `Date.parse` cannot do this — it understands fixed offsets (`+08:00`) but not
 * zone names, and a fixed offset is wrong for any zone that observes DST.
 */

/** How far ahead of UTC `timeZone` is at a given instant, in milliseconds. */
export function zoneOffsetMs(atMs: number, timeZone: string): number {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = format.formatToParts(new Date(atMs));
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)?.value ?? '0';
    return Number(found);
  };

  // `hour` comes back as 24 at midnight under hour12:false in some ICU builds.
  const hour = value('hour') % 24;
  const asIfUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    hour,
    value('minute'),
    value('second'),
  );
  return asIfUtc - atMs;
}

/**
 * Combines a `YYYY-MM-DD` date and an `HH:MM` time in `timeZone`.
 *
 * `timeZone` may also be a fixed offset (`+08:00`), which skips the zone lookup.
 * Returns `null` when the pieces do not parse, so the caller can name the field.
 */
export function zonedToEpochMs(
  date: string,
  time: string,
  timeZone: string,
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? '0');
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const fixed = /^([+-])(\d{2}):?(\d{2})$/.exec(timeZone.trim());
  if (fixed) {
    const sign = fixed[1] === '-' ? -1 : 1;
    const offsetMs =
      sign * (Number(fixed[2]) * 3_600_000 + Number(fixed[3]) * 60_000);
    return Date.parse(`${date}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`) - offsetMs;
  }

  const asUtc = Date.parse(`${date}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`);
  if (Number.isNaN(asUtc)) {
    return null;
  }

  // The offset depends on the instant, and the instant depends on the offset.
  // One correction pass settles it everywhere except inside a DST gap, where any
  // answer is arbitrary anyway.
  const firstGuess = asUtc - zoneOffsetMs(asUtc, timeZone);
  const corrected = asUtc - zoneOffsetMs(firstGuess, timeZone);
  return corrected;
}

/** True when `Intl` recognises the zone, so a typo is reported, not ignored. */
export function isKnownTimeZone(timeZone: string): boolean {
  if (/^[+-]\d{2}:?\d{2}$/.test(timeZone.trim())) {
    return true;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
