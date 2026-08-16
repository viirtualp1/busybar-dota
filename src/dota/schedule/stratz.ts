/**
 * STRATZ GraphQL schedule source.
 *
 * ⚠️ WRITTEN TO SPEC, NOT VERIFIED AGAINST A LIVE RESPONSE. STRATZ token signup
 * was broken when this was written, so the query below follows their documented
 * `League.nodeGroups` shape but the field names have not been confirmed by an
 * actual call. Run `npm run stratz:check` once you have a token: it prints the
 * raw response so any mismatch is obvious, and every field here is read
 * defensively so a wrong name degrades to a missing value rather than a crash.
 *
 * Two known hazards beyond field names:
 *   - api.stratz.com sits behind Cloudflare, which may reject server-side calls
 *     outright regardless of the token.
 *   - STRATZ asks for a descriptive User-Agent; requests without one get
 *     throttled harder.
 */
import { deriveTag } from '../types.js';
import { shortenStage } from './json.js';
import type { BracketRow, Schedule, ScheduleSource, UpcomingMatch } from './types.js';

const ENDPOINT = 'https://api.stratz.com/graphql';

/**
 * Kept as one editable constant on purpose: if a field name turns out to be
 * wrong, this is the only place that needs touching.
 */
export const LEAGUE_QUERY = `
query BusyBarSchedule($leagueId: Int!) {
  league(id: $leagueId) {
    id
    displayName
    nodeGroups {
      id
      name
      nodeGroupType
      nodes {
        id
        name
        scheduledTime
        actualTime
        hasStarted
        isCompleted
        teamOneWins
        teamTwoWins
        seriesType
        teamOne { id name tag }
        teamTwo { id name tag }
      }
    }
  }
}`.trim();

export type StratzOptions = {
  token: string;
  leagueId: number;
  timeoutMs: number;
};

export class StratzScheduleSource implements ScheduleSource {
  readonly label: string;

  constructor(
    private readonly options: StratzOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.label = `stratz (league ${options.leagueId}, unverified schema)`;
  }

  async poll(): Promise<Schedule | null> {
    const body = await this.request();
    const nodes = readNodes(body);
    if (nodes.length === 0) {
      return null;
    }

    const matches = nodes
      .filter((node) => !node.isCompleted)
      .sort((a, b) => (a.startsAtMs ?? Infinity) - (b.startsAtMs ?? Infinity));

    return {
      next: matches[0]?.match ?? null,
      bracket: nodes.map((node) => node.row),
    };
  }

  /** Also used by `stratz:check`, which prints whatever comes back. */
  async request(): Promise<unknown> {
    const response = await this.fetchImpl(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(this.options.timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.token}`,
        // STRATZ throttles anonymous-looking clients harder.
        'User-Agent': 'busybar-dota (https://busy.app pet project)',
      },
      body: JSON.stringify({
        query: LEAGUE_QUERY,
        variables: { leagueId: this.options.leagueId },
      }),
    });

    if (!response.ok) {
      const hint =
        response.status === 403
          ? ' — either the token is wrong or Cloudflare blocked the request'
          : '';
      throw new Error(`STRATZ responded ${response.status}${hint}`);
    }

    const body: unknown = await response.json();
    const errors = isRecord(body) ? body['errors'] : undefined;
    if (Array.isArray(errors) && errors.length > 0) {
      const first: unknown = errors[0];
      const message = isRecord(first) ? str(first['message']) : '';
      throw new Error(`STRATZ GraphQL error: ${message || 'unspecified'}`);
    }
    return body;
  }
}

type ParsedNode = {
  startsAtMs: number | null;
  isCompleted: boolean;
  match: UpcomingMatch;
  row: BracketRow;
};

function readNodes(body: unknown): ParsedNode[] {
  const data = isRecord(body) ? body['data'] : undefined;
  const league = isRecord(data) ? data['league'] : undefined;
  const groups = isRecord(league) ? league['nodeGroups'] : undefined;
  if (!Array.isArray(groups)) {
    return [];
  }

  const parsed: ParsedNode[] = [];
  for (const group of groups.filter(isRecord)) {
    const stage = str(group['name']);
    const nodes = group['nodes'];
    if (!Array.isArray(nodes)) {
      continue;
    }
    for (const node of nodes.filter(isRecord)) {
      parsed.push(readNode(node, stage));
    }
  }
  return parsed;
}

function readNode(node: Record<string, unknown>, stage: string): ParsedNode {
  const teamA = teamName(node['teamOne'], 'TBD');
  const teamB = teamName(node['teamTwo'], 'TBD');
  // STRATZ timestamps are unix seconds throughout its API.
  const scheduled = secondsToMs(node['scheduledTime']);
  const actual = secondsToMs(node['actualTime']);
  const startsAtMs = actual ?? scheduled;
  const isCompleted = node['isCompleted'] === true;
  const winsA = numOrNull(node['teamOneWins']);
  const winsB = numOrNull(node['teamTwoWins']);

  return {
    startsAtMs,
    isCompleted,
    match: {
      teamA: teamA.name,
      teamB: teamB.name,
      tagA: teamA.tag,
      tagB: teamB.tag,
      startsAtMs,
      stage,
      stageShort: shortenStage(stage),
      bestOf: seriesTypeToBestOf(numOrNull(node['seriesType'])),
    },
    row: {
      label: shortenStage(stage) || str(node['name']).slice(0, 6),
      text:
        isCompleted && winsA !== null && winsB !== null
          ? `${teamA.name} ${winsA}-${winsB} ${teamB.name}`
          : `${teamA.name} vs ${teamB.name}`,
      next: false,
    },
  };
}

function teamName(raw: unknown, fallback: string): { name: string; tag: string } {
  if (!isRecord(raw)) {
    return { name: fallback, tag: fallback };
  }
  const name = str(raw['name']) || fallback;
  return { name, tag: str(raw['tag']) || deriveTag(name, fallback) };
}

/** STRATZ encodes series length as 0 = bo1, 1 = bo3, 2 = bo5. */
export function seriesTypeToBestOf(seriesType: number | null): number {
  if (seriesType === 0) {
    return 1;
  }
  if (seriesType === 1) {
    return 3;
  }
  return seriesType === 2 ? 5 : 0;
}

function secondsToMs(value: unknown): number | null {
  const seconds = numOrNull(value);
  return seconds === null || seconds <= 0 ? null : seconds * 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numOrNull(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
