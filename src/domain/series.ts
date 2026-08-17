/**
 * The gap between games of a series.
 *
 * A Bo3 disappears from the live feed for ten to twenty minutes between games.
 * Without this the display falls straight through to "next scheduled match" and
 * counts down to tomorrow while game 2 is about to start.
 */
import type { Winner } from '../dota/match-result.js';
import type { MatchSnapshot } from '../dota/types.js';

/**
 * If a series has not resumed within this long, it is over or postponed and the
 * display should go back to the schedule.
 */
export const BREAK_TIMEOUT_MS = 45 * 60 * 1000;

export type SeriesBreak = {
  radiantName: string;
  direName: string;
  radiantTag: string;
  direTag: string;
  /** Wins including the game that just finished, once its winner is known. */
  radiantWins: number;
  direWins: number;
  /** 1-based number of the game that comes next. */
  nextGame: number;
  /** Games needed to take the series. */
  winsNeeded: number;
  /** The game that just ended, so its result can be looked up. */
  lastMatchId: string;
  /** True until the winner of `lastMatchId` is known; the score is stale meanwhile. */
  pendingResult: boolean;
  startedAtMs: number;
};

/** Steam and STRATZ agree: 0 = Bo1, 1 = Bo3, 2 = Bo5. */
export function winsNeeded(seriesType: number): number {
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
): boolean {
  const needed = winsNeeded(seriesType);
  return radiantWins >= needed || direWins >= needed;
}

/**
 * Builds the break state from the last live snapshot.
 *
 * Returns `null` for a Bo1, or when the series was already decided going into
 * the game that just ended — in both cases nothing more is coming.
 */
export function beginBreak(
  last: MatchSnapshot,
  nowMs: number,
): SeriesBreak | null {
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
    startedAtMs: nowMs,
  };
}

/**
 * Folds in the result of the game that just ended.
 *
 * Returns `null` once that game decided the series — there is no next game to
 * wait for, so the display should move on to the schedule.
 */
export function applyResult(
  current: SeriesBreak,
  winner: Winner,
): SeriesBreak | null {
  const radiantWins = current.radiantWins + (winner === 'radiant' ? 1 : 0);
  const direWins = current.direWins + (winner === 'dire' ? 1 : 0);

  if (radiantWins >= current.winsNeeded || direWins >= current.winsNeeded) {
    return null;
  }
  return {
    ...current,
    radiantWins,
    direWins,
    nextGame: radiantWins + direWins + 1,
    pendingResult: false,
  };
}

export function isBreakExpired(current: SeriesBreak, nowMs: number): boolean {
  return nowMs - current.startedAtMs > BREAK_TIMEOUT_MS;
}
