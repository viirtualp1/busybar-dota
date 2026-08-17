export function zoneOffsetMs(atMs: number, timeZone: string) {
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
  const value = (type: Intl.DateTimeFormatPartTypes) => {
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
    const offsetMs = sign * (Number(fixed[2]) * 3_600_000 + Number(fixed[3]) * 60_000);
    return Date.parse(`${date}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`) - offsetMs;
  }

  const asUtc = Date.parse(`${date}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`);
  if (Number.isNaN(asUtc)) {
    return null;
  }

  // The offset depends on the instant, and the instant depends on the offset.
  // One correction pass settles it everywhere except inside a DST gap.
  const firstGuess = asUtc - zoneOffsetMs(asUtc, timeZone);
  const corrected = asUtc - zoneOffsetMs(firstGuess, timeZone);

  return corrected;
}

export function isKnownTimeZone(timeZone: string) {
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

function pad(value: number) {
  return String(value).padStart(2, '0');
}
