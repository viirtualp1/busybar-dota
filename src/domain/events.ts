import type { MatchSnapshot } from '../dota/types.js';

export type MatchEvent =
  | null
  | 'radiant-kill'
  | 'dire-kill'
  | 'radiant-tower'
  | 'dire-tower'
  | 'match-start'
  | 'match-end';

export type EventState = {
  matchId: string;
  radiantKills: number;
  direKills: number;
  radiantTowers: number | null;
  direTowers: number | null;
  live: boolean;
};

export const initialEventState: EventState = {
  matchId: '',
  radiantKills: 0,
  direKills: 0,
  radiantTowers: null,
  direTowers: null,
  live: false,
};

export function stateOf(snapshot: MatchSnapshot): EventState {
  return {
    matchId: snapshot.matchId,
    radiantKills: snapshot.radiant.kills,
    direKills: snapshot.dire.kills,
    radiantTowers: snapshot.radiant.towers,
    direTowers: snapshot.dire.towers,
    live: snapshot.live,
  };
}

/**
 * Compares two polls and reports the single most interesting thing that changed.
 *
 * Only one event per poll: at a 5s cadence several things can happen at once,
 * and flashing the bar twice in one frame reads as a glitch rather than a
 * teamfight. Towers outrank kills because they are rarer.
 */
export function detectEvent(
  previous: EventState,
  snapshot: MatchSnapshot,
): { event: MatchEvent; state: EventState } {
  const state = stateOf(snapshot);

  // A new match resets every counter, so treat it as a start rather than
  // reporting a phantom 20-kill swing.
  if (previous.matchId !== state.matchId) {
    return { event: state.live ? 'match-start' : null, state };
  }
  if (previous.live && !state.live) {
    return { event: 'match-end', state };
  }
  if (!state.live) {
    return { event: null, state };
  }

  // `towers` is null on sources without building state; a null↔number
  // transition is a source change, not a tower falling.
  if (fell(previous.radiantTowers, state.radiantTowers)) {
    return { event: 'radiant-tower', state };
  }
  if (fell(previous.direTowers, state.direTowers)) {
    return { event: 'dire-tower', state };
  }
  if (state.radiantKills > previous.radiantKills) {
    return { event: 'radiant-kill', state };
  }
  if (state.direKills > previous.direKills) {
    return { event: 'dire-kill', state };
  }
  return { event: null, state };
}

function fell(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && after < before;
}
