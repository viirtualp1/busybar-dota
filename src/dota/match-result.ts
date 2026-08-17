const ENDPOINT = 'https://api.opendota.com/api/matches';

export type Winner = 'radiant' | 'dire';

export type ResultLookup = {
  winnerOf(matchId: string): Promise<Winner | null>;
};

export class DemoResultLookup implements ResultLookup {
  constructor(private readonly winner: Winner = 'radiant') {}

  winnerOf(): Promise<Winner | null> {
    return Promise.resolve(this.winner);
  }
}

export class MatchResultLookup implements ResultLookup {
  private readonly cache = new Map<string, Winner>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  known(matchId: string): Winner | null {
    return this.cache.get(matchId) ?? null;
  }

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
        // Present but null means "parsed, outcome unknown" — replay not processed yet.
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
