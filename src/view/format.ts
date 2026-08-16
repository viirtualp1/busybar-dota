/** Game clock. Negative time is the pre-horn countdown and shows as `-0:42`. */
export function formatClock(totalSeconds: number): string {
  const negative = totalSeconds < 0;
  const seconds = Math.abs(Math.trunc(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${negative ? '-' : ''}${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Net worth in the compact form casters use: `12.3k`, `1.2k`, `840`. */
export function formatGold(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) {
    return String(Math.round(abs));
  }
  const thousands = abs / 1000;
  // Four-digit thousands would overflow the column, so drop the decimal there.
  return thousands >= 100
    ? `${Math.round(thousands)}k`
    : `${thousands.toFixed(1).replace(/\.0$/, '')}k`;
}

/**
 * Countdown to a scheduled start.
 *
 * The unit shrinks as the wait does, because that is what you care about: days
 * out you want the day, minutes out you want the seconds. Anything already due
 * reads `SOON` rather than counting up — schedules slip, and a negative
 * countdown looks like a bug.
 */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return 'SOON';
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

/** Local wall-clock time of the start, e.g. `10:00`. */
export function formatStartTime(startsAtMs: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(startsAtMs));
}

/** Local date of the start, e.g. `16 Aug`. Shown on the back, where there is room. */
export function formatStartDate(startsAtMs: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(startsAtMs));
}

export function formatKda(
  kills: number | null,
  deaths: number | null,
  assists: number | null,
): string {
  if (kills === null || deaths === null || assists === null) {
    return '';
  }
  return `${kills}/${deaths}/${assists}`;
}
