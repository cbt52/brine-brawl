import type { ScoreRow } from '../../../shared/protocol.ts';

/** Local stats (backlog #9): counted per finished round, kept in this browser only. */
export const STATS_KEY = 'brawl.stats';

export interface LocalStats {
  /** finished rounds the player took part in */
  matches: number;
  /** rounds the player finished first in */
  wins: number;
  kos: number;
  /** biggest bounty banked in one round (doubloons) */
  bestBounty: number;
  /** rounds per fighter id */
  plays: Record<string, number>;
  /** `room:round` of the last counted round, so a reload on the results screen does not count twice */
  last: string;
}

export const EMPTY_STATS: LocalStats = { matches: 0, wins: 0, kos: 0, bestBounty: 0, plays: {}, last: '' };

/** Adds one finished round for `selfId`; returns the same object when nothing changes. */
export function addRound(s: LocalStats, rows: ScoreRow[], selfId: number, key: string): LocalStats {
  if (s.last === key) return s;
  const me = rows.find((r) => r.id === selfId);
  if (!me) return s;
  return {
    matches: s.matches + 1,
    wins: s.wins + (rows[0]?.id === selfId ? 1 : 0),
    kos: s.kos + me.k,
    bestBounty: Math.max(s.bestBounty, me.b),
    plays: { ...s.plays, [me.f]: (s.plays[me.f] ?? 0) + 1 },
    last: key,
  };
}

/** The fighter played in the most rounds (first one played wins a tie). */
export function favoriteFighter(s: LocalStats): string | undefined {
  let best: string | undefined;
  for (const [id, n] of Object.entries(s.plays)) {
    if (best === undefined || n > (s.plays[best] ?? 0)) best = id;
  }
  return best;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** Reads the saved stats; anything unreadable (corrupt JSON, private mode) starts from zero. */
export function loadStats(): LocalStats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null') as Partial<Record<keyof LocalStats, unknown>> | null;
    if (!raw || typeof raw !== 'object') return EMPTY_STATS;
    const plays: Record<string, number> = {};
    if (raw.plays && typeof raw.plays === 'object') {
      for (const [id, n] of Object.entries(raw.plays)) plays[id] = num(n);
    }
    return {
      matches: num(raw.matches),
      wins: num(raw.wins),
      kos: num(raw.kos),
      bestBounty: num(raw.bestBounty),
      plays,
      last: typeof raw.last === 'string' ? raw.last : '',
    };
  } catch {
    return EMPTY_STATS;
  }
}

let cache: LocalStats | null = null;

/** The stats of this browser, read from storage once per page load. */
export function currentStats(): LocalStats {
  cache ??= loadStats();
  return cache;
}

/**
 * Counts a finished round and saves it. Called every frame while the results screen is up, so the
 * `last` key is what keeps it to one write per round.
 */
export function countRound(rows: ScoreRow[], selfId: number, key: string): void {
  const s = currentStats();
  const next = addRound(s, rows, selfId, key);
  if (next === s) return;
  cache = next;
  try { localStorage.setItem(STATS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
}
