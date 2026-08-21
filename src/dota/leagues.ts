import { asciiName } from './types';

const LEAGUE_URL = 'https://api.opendota.com/api/leagues';

export class LeagueCatalog {
  private label = '';
  private id = 0;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  get name() {
    return this.label;
  }

  // Asked once per league id, whether it came from LEAGUE_ID or from the game
  // the app happened to follow.
  async load(leagueId: number, timeoutMs = 10_000): Promise<boolean> {
    if (!leagueId || leagueId === this.id) {
      return this.label !== '';
    }
    this.id = leagueId;
    this.label = '';

    try {
      const response = await this.fetchImpl(`${LEAGUE_URL}/${leagueId}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        return false;
      }

      const body: unknown = await response.json();
      this.label = readName(body);

      return this.label !== '';
    } catch {
      return false;
    }
  }
}

function readName(body: unknown) {
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const name = (body as { name?: unknown }).name;

  return typeof name === 'string' ? asciiName(name) : '';
}

// The bold row is nine glyphs wide, so a name that does not fit falls back to its
// initials with any trailing year or season number kept: `The International 2026`
// becomes `TI 2026`.
export function shortLeagueName(name: string, maxChars: number) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '' || clean.length <= maxChars) {
    return clean;
  }

  const words = clean.split(' ');
  const tail = /^\d+$/.test(words.at(-1) ?? '') ? words.pop() : '';
  const initials = words
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
  const short = tail ? `${initials} ${tail}` : initials;

  return short.length <= maxChars ? short : short.slice(0, maxChars);
}
