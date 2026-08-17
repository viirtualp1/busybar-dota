import type { Winner } from '../dota/match-result';
import type { MatchSnapshot } from '../dota/types';

export const BREAK_TIMEOUT_MS = 45 * 60 * 1000;

export const RESULT_SCREEN_MS = 2 * 60 * 1000;

export const RESULT_TAIL_MS = 20 * 60 * 1000;

export type SeriesBreak = {
  radiantName: string;
  direName: string;
  radiantTag: string;
  direTag: string;
  radiantWins: number;
  direWins: number;
  nextGame: number;
  winsNeeded: number;
  lastMatchId: string;
  pendingResult: boolean;
  lastWinner: Side | null;
  startedAtMs: number;
};

export type Side = 'radiant' | 'dire';

export function isShowingResult(current: SeriesBreak, nowMs: number) {
  return nowMs - current.startedAtMs < RESULT_SCREEN_MS;
}

export function isResultFresh(current: SeriesBreak, nowMs: number) {
  return nowMs - current.startedAtMs < RESULT_TAIL_MS;
}

export function resultText(current: SeriesBreak) {
  const game = current.nextGame - 1;
  if (!current.lastWinner) {
    return `Game ${game}: ${current.radiantName} vs ${current.direName}, result pending`;
  }
  const [winner, loser] =
    current.lastWinner === 'radiant'
      ? [current.radiantName, current.direName]
      : [current.direName, current.radiantName];

  return `Game ${game}: ${winner} beat ${loser}`;
}

export function winsNeeded(seriesType: number) {
  if (seriesType === 1) {
    return 2;
  }

  if (seriesType === 2) {
    return 3;
  }

  return 1;
}

export function isSeriesDecided(
  radiantWins: number,
  direWins: number,
  seriesType: number,
) {
  const needed = winsNeeded(seriesType);

  return radiantWins >= needed || direWins >= needed;
}

export function beginBreak(last: MatchSnapshot, nowMs: number): SeriesBreak | null {
  if (last.seriesType === 0) {
    return null;
  }
  const radiantWins = last.radiant.seriesWins;
  const direWins = last.dire.seriesWins;
  if (isSeriesDecided(radiantWins, direWins, last.seriesType)) {
    return null;
  }

  return {
    radiantName: last.radiant.name,
    direName: last.dire.name,
    radiantTag: last.radiant.tag,
    direTag: last.dire.tag,
    radiantWins,
    direWins,
    // The score is still pre-game, so the game that just ended is this one.
    nextGame: radiantWins + direWins + 2,
    winsNeeded: winsNeeded(last.seriesType),
    lastMatchId: last.matchId,
    pendingResult: true,
    lastWinner: null,
    startedAtMs: nowMs,
  };
}

export function applyResult(current: SeriesBreak, winner: Winner): SeriesBreak {
  const radiantWins = current.radiantWins + (winner === 'radiant' ? 1 : 0);
  const direWins = current.direWins + (winner === 'dire' ? 1 : 0);

  const decided = radiantWins >= current.winsNeeded || direWins >= current.winsNeeded;
  return {
    ...current,
    radiantWins,
    direWins,
    nextGame: radiantWins + direWins + 1,
    pendingResult: false,
    lastWinner: winner,

    winsNeeded: decided ? 0 : current.winsNeeded,
  };
}

export function isBreakExpired(current: SeriesBreak, nowMs: number) {
  return nowMs - current.startedAtMs > BREAK_TIMEOUT_MS;
}

export function isSeriesOver(current: SeriesBreak) {
  return current.winsNeeded === 0;
}
