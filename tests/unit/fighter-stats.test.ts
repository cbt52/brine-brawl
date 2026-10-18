import { describe, it, expect } from 'vitest';
import { FIGHTERS, SELECTABLE, getFighter } from '../../shared/fighters/index.ts';
import { abilitySummary, attackDamage, fighterStats } from '../../shared/fighters/stats.ts';

describe('fighter select data', () => {
  it('offers the four real kits, without the Deckhand fallback', () => {
    expect(SELECTABLE.map((f) => f.id)).toEqual(['voltbun', 'mira', 'noodle', 'sudsy']);
    expect(SELECTABLE.some((f) => f.id === 'default')).toBe(false);
  });

  it('gives every fighter move names and a blurb', () => {
    for (const f of FIGHTERS) {
      expect(f.blurb.length, f.id).toBeGreaterThan(10);
      for (const k of ['attack', 'special', 'ult'] as const) {
        expect(f.moves?.[k], `${f.id}.${k}`).toBeTruthy();
      }
    }
  });

  it('keeps the three stat bars inside 0…1 and ordered by the raw numbers', () => {
    for (const f of FIGHTERS) {
      const s = fighterStats(f);
      for (const v of [s.hp, s.speed, s.dmg]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(fighterStats(getFighter('noodle')).hp).toBeGreaterThan(fighterStats(getFighter('voltbun')).hp);
    expect(fighterStats(getFighter('voltbun')).speed).toBeGreaterThan(fighterStats(getFighter('noodle')).speed);
  });

  it('counts every projectile of a volley as attack damage', () => {
    expect(attackDamage(getFighter('sudsy'))).toBe(27); // 3 bubbles × 9
    expect(attackDamage(getFighter('mira'))).toBe(18); // whip
    expect(attackDamage(getFighter('noodle'))).toBe(22); // jab
  });

  it('summarises every ability in one short line', () => {
    for (const f of FIGHTERS) {
      for (const a of [f.attack, f.special, f.ult]) {
        const text = abilitySummary(a);
        expect(text.length, `${f.id}: ${a.kind}`).toBeGreaterThan(3);
        expect(text.length).toBeLessThanOrEqual(64);
      }
    }
    expect(abilitySummary(getFighter('sudsy').attack)).toContain('3-shot');
  });
});
