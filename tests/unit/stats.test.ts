import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EMPTY_STATS, STATS_KEY, addRound, countRound, currentStats, favoriteFighter, loadStats, type LocalStats,
} from '../../client/src/ui/stats.ts';
import type { ScoreRow } from '../../shared/protocol.ts';

const row = (id: number, f: string, b: number, k: number, bot = 0): ScoreRow => ({ id, n: `p${id}`, k, d: 0, b, f, bot });
// results are ranked: the winner first
const ROUND: ScoreRow[] = [row(1, 'voltbun', 120, 2), row(1000, 'embercub', 90, 1, 1), row(1001, 'sudsy', 40, 0, 1)];

function stubStorage(raw: string | null): ReturnType<typeof vi.fn> {
  const store = new Map<string, string>(raw === null ? [] : [[STATS_KEY, raw]]);
  const setItem = vi.fn((k: string, v: string) => { store.set(k, v); });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem });
  return setItem;
}

afterEach(() => vi.unstubAllGlobals());

describe('local stats (backlog #9)', () => {
  it('counts a won round for the player', () => {
    const s = addRound(EMPTY_STATS, ROUND, 1, 'room:1');
    expect(s).toMatchObject({ matches: 1, wins: 1, kos: 2, bestBounty: 120, plays: { voltbun: 1 }, last: 'room:1' });
  });

  it('counts a lost round without a win, and its own bounty', () => {
    const s = addRound(EMPTY_STATS, ROUND, 1001, 'room:1');
    expect(s).toMatchObject({ matches: 1, wins: 0, kos: 0, bestBounty: 40, plays: { sudsy: 1 } });
  });

  it('ignores rounds the player was not in', () => {
    expect(addRound(EMPTY_STATS, ROUND, 7, 'room:1')).toBe(EMPTY_STATS);
  });

  it('counts each round key once', () => {
    const once = addRound(EMPTY_STATS, ROUND, 1, 'room:1');
    expect(addRound(once, ROUND, 1, 'room:1')).toBe(once);
  });

  it('keeps the best bounty and the per-fighter counts across rounds', () => {
    const a = addRound(EMPTY_STATS, ROUND, 1, 'room:1');
    const b = addRound(a, [row(1, 'voltbun', 50, 0), row(2, 'sudsy', 10, 0)], 1, 'room:2');
    expect(b).toMatchObject({ matches: 2, wins: 2, kos: 2, bestBounty: 120, plays: { voltbun: 2 } });
  });

  it('picks the most played fighter, first one played on a tie', () => {
    const none: LocalStats = { ...EMPTY_STATS };
    expect(favoriteFighter(none)).toBeUndefined();
    expect(favoriteFighter({ ...none, plays: { a: 1, b: 3, c: 3 } })).toBe('b');
  });

  it('reads saved stats and clamps bad values to zero', () => {
    stubStorage('{"matches":3,"wins":"x","kos":-4,"plays":{"sudsy":-2,"tide":4},"last":5}');
    expect(loadStats()).toEqual({ matches: 3, wins: 0, kos: 0, bestBounty: 0, plays: { sudsy: 0, tide: 4 }, last: '' });
  });

  it('starts from zero when the saved value is corrupt or missing', () => {
    stubStorage('{not json');
    expect(loadStats()).toEqual(EMPTY_STATS);
    vi.unstubAllGlobals();
    stubStorage(null);
    expect(loadStats()).toEqual(EMPTY_STATS);
  });

  it('saves a round once, however many frames the results screen is up', () => {
    const setItem = stubStorage(null);
    countRound(ROUND, 1, 'room:4');
    countRound(ROUND, 1, 'room:4');
    countRound(ROUND, 1, 'room:4');
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(currentStats()).toMatchObject({ matches: 1, last: 'room:4' });
    expect(JSON.parse(setItem.mock.calls[0][1]).last).toBe('room:4');
  });
});
