import { describe, it, expect } from 'vitest';
import { formatReport, runBalance, runMatch } from '../../scripts/lib/balance.ts';
import { SELECTABLE } from '../../shared/fighters/index.ts';

const ids = SELECTABLE.map((d) => d.id);

describe('balance harness', () => {
  it('replays the same seed exactly (deterministic bots)', () => {
    const a = runMatch(['voltbun', 'mira'], 42, 8);
    const b = runMatch(['voltbun', 'mira'], 42, 8);
    expect(b).toEqual(a);
    expect(a.slots).toHaveLength(2);
    expect(a.slots.map((s) => s.fighter)).toEqual(['voltbun', 'mira']);
  });

  it('runs every pair in quick mode, inside 30 s', () => {
    const t0 = Date.now();
    const r = runBalance({ quick: true });
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(30_000);
    expect(r.ms).toBeLessThan(30_000);
    // every selectable kit shows up in the 1v1 table
    expect(r.overall.map((t) => t.fighter).sort()).toEqual(ids.slice().sort());
    // each pair plays `seeds` matches from both sides
    const pairs = (ids.length * (ids.length - 1)) / 2;
    expect(r.overall.reduce((n, t) => n + t.matches, 0)).toBe(pairs * r.seeds * 2);
    for (const t of r.overall) {
      expect(t.winrate).toBeGreaterThanOrEqual(0);
      expect(t.winrate).toBeLessThanOrEqual(1);
      expect(t.dmgPerKo).toBeGreaterThanOrEqual(0);
    }
    // the matrix mirrors: one side's loss is the other's win
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        expect(r.matrix[a][b] + r.matrix[b][a]).toBeCloseTo(1, 6);
      }
    }
    // outliers are exactly the fighters outside the 40–60 % band
    const outside = r.overall.filter((t) => t.winrate < 0.4 || t.winrate > 0.6).map((t) => t.fighter);
    expect(r.outliers.map((t) => t.fighter).sort()).toEqual(outside.sort());
    expect(formatReport(r)).toContain('## Pair matrix');
  }, 60_000);
});
