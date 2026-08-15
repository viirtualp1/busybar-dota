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
