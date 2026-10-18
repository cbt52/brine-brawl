import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { getFighter } from '../../shared/fighters/index.ts';

describe('mid-match fighter swap (menu "pick")', () => {
  it('parks the pick and applies it on the next respawn', () => {
    const w = new World();
    const p = w.addPlayer(1, 'a', 'voltbun');
    expect(p.fighter).toBe('voltbun');

    expect(w.setFighter(1, 'noodle')).toBe(true);
    // alive: nothing changes yet
    expect(p.fighter).toBe('voltbun');
    expect(p.mhp).toBe(getFighter('voltbun').maxHp);

    w.debugKill(1); // spawn shield would block a plain damage() call
    expect(p.down).toBe(true);
    p.respawn = 0;
    w.step();

    expect(p.down).toBe(false);
    expect(p.fighter).toBe('noodle');
    expect(p.def.id).toBe('noodle');
    expect(p.mhp).toBe(getFighter('noodle').maxHp);
    expect(p.hp).toBe(p.mhp);
    expect(p.r).toBe(getFighter('noodle').radius);
    expect(p.speedMul).toBe(getFighter('noodle').speedMul);
    expect(p.pendingFighter).toBeNull();
  });

  it('ignores unknown ids (falls back to the Deckhand) and unchanged picks', () => {
    const w = new World();
    const p = w.addPlayer(1, 'a', 'mira');
    expect(w.setFighter(1, 'mira')).toBe(false);
    expect(p.pendingFighter).toBeNull();
    expect(w.setFighter(1, 'not-a-fighter')).toBe(true);
    expect(p.pendingFighter).toBe('default');
    expect(w.setFighter(99, 'sudsy')).toBe(false);
  });
});
