/**
 * Who won a match that has already finished.
 *
 * Needed because the live feed simply stops listing a game when it ends, and the
 * series score it carried was the score *going into* that game. Without this,
 * the break after game 1 of a Bo3 would show 0-0 and only correct itself when
 * game 2 starts.
 *
 * OpenDota's `/matches/{id}` answers this with no key, which is why it is used
 * here rather than Steam's `GetMatchDetails` (same field, but needs one).
 */
const ENDPOINT = 'https://api.opendota.com/api/matches';

export type Winner = 'radiant' | 'dire';

export class MatchResultLookup {
  /** Results never change, so a match is only ever asked about once. */
  private readonly cache = new Map<string, Winner>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  known(matchId: string): Winner | null {
    return this.cache.get(matchId) ?? null;
  }

  /**
   * `null` while the result is not available yet — OpenDota takes a few minutes
   * to ingest a match after it ends, so this is expected to fail at first and
   * succeed on a later poll. Never throws: an unknown winner degrades to the
   * stale series score, which is worse but not wrong-looking.
   */
  async winnerOf(matchId: string): Promise<Winner | null> {
    if (!matchId || matchId === 'demo') {
      return null;
    }
    const cached = this.cache.get(matchId);
    if (cached) {
      return cached;
    }
    if (this.pending.has(matchId)) {
      return null;
    }

    this.pending.add(matchId);
    try {
      const response = await this.fetchImpl(
        `${ENDPOINT}/${encodeURIComponent(matchId)}`,
        { signal: AbortSignal.timeout(this.timeoutMs) },
      );
      if (!response.ok) {
        return null;
      }
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) {
        return null;
      }
      const radiantWin = (body as Record<string, unknown>)['radiant_win'];
      if (typeof radiantWin !== 'boolean') {
        // Present but null means "parsed, outcome unknown" — a replay that has
        // not been processed yet. Worth asking again later.
        return null;
      }
      const winner: Winner = radiantWin ? 'radiant' : 'dire';
      this.cache.set(matchId, winner);
      return winner;
    } catch {
      return null;
    } finally {
      this.pending.delete(matchId);
    }
  }
}
