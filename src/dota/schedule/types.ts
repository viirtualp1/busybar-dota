/**
 * Upcoming matches and bracket state.
 *
 * Deliberately a separate source from the live one: Valve removed
 * `GetScheduledLeagueGames` (it 404s), and no keyless API publishes a pro
 * schedule. Every real option — Liquipedia's v3 API, STRATZ, PandaScore —
 * needs a key, so the source is an interface with a demo implementation and the
 * real one is plugged in per deployment.
 */

export type UpcomingMatch = {
  /**
   * Sides are not assigned until the game loads, so these are just "the two
   * teams" — calling them radiant and dire before the fact would be a lie.
   */
  teamA: string;
  teamB: string;
  tagA: string;
  tagB: string;
  /** Epoch ms. `null` when the schedule says TBD, which is common in brackets. */
  startsAtMs: number | null;
  /** `Upper Bracket R2`, `Group A`, … */
  stage: string;
  /** Short form for the 26px slot on the front display. */
  stageShort: string;
  /** 1, 3, 5 — or 0 when unknown. */
  bestOf: number;
};

export type BracketRow = {
  /** `UB R2`, `LB R1`, `GRAND` … */
  label: string;
  /** `Spirit 2-0 Falcons`, `Spirit vs Falcons`, `TBD vs Falcons`. */
  text: string;
  /** Marks the row the countdown is about. */
  next: boolean;
};

export type Schedule = {
  next: UpcomingMatch | null;
  bracket: BracketRow[];
};

export type ScheduleSource = {
  readonly label: string;
  /** `null` means "no schedule information available", not "nothing scheduled". */
  poll(): Promise<Schedule | null>;
};
