export function formatClock(totalSeconds: number) {
  const negative = totalSeconds < 0;
  const seconds = Math.abs(Math.trunc(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${negative ? '-' : ''}${minutes}:${String(rest).padStart(2, '0')}`;
}

export function formatGold(value: number) {
  const abs = Math.abs(value);
  if (abs < 1000) {
    return String(Math.round(abs));
  }
  const thousands = abs / 1000;

  return thousands >= 100
    ? `${Math.round(thousands)}k`
    : `${thousands.toFixed(1).replace(/\.0$/, '')}k`;
}

export function formatCountdown(remainingMs: number) {
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
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${minutes}:${pad(seconds)}`;
}

export function formatStartTime(startsAtMs: number, locale?: string) {
  return new Intl.DateTimeFormat(locale ?? 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(startsAtMs));
}

export function formatStartDate(startsAtMs: number, locale?: string) {
  return new Intl.DateTimeFormat(locale ?? 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(startsAtMs));
}

export function formatKda(
  kills: number | null,
  deaths: number | null,
  assists: number | null,
) {
  if (kills === null || deaths === null || assists === null) {
    return '';
  }

  return `${kills}/${deaths}/${assists}`;
}
