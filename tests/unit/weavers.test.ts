import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { getFighter } from '../../shared/fighters/index.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** The two Weavers load and are wired to their kits. */
describe('Weavers roster', () => {
  it('Pip and Brak are selectable with a distinct kit', () => {
    const pip = getFighter('pip');
    const brak = getFighter('brak');
    expect(pip.name).toBe('Pip Windwhistle');
    expect(brak.name).toBe('Brak Stonefist');
    expect(pip.faction).toBe('weavers');
    expect(brak.faction).toBe('weavers');
    expect(pip.attack.kind).toBe('projectile');
    expect(brak.attack.kind).toBe('melee');
    expect(pip.special.kind).not.toBe(brak.special.kind);
  });

  it('Pip: Gust Darts fire as a pair and both can land', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pip');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1240; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('pip').attack, 'attack');
    expect(w.projs.length).toBe(2);
    const hp0 = b.hp;
    run(w, 0.6);
    expect(b.hp).toBeLessThan(hp0);
  });

  it('Pip: Kite Lift dashes and clips the fighter in the way', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pip');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1120; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    const hp0 = b.hp;
    castAbility(w, a, getFighter('pip').special, 'special');
    run(w, 0.4);
    expect(a.x).toBeGreaterThan(1180);
    expect(b.hp).toBeLessThan(hp0);
  });

  it('Pip: Whirlwind grinds, pulls and slows inside its zone', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pip');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1180; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('pip').ult, 'ult');
    const eye = w.zones[0].x;
    const gap0 = Math.abs(b.x - eye);
    run(w, 1.0);
    expect(b.hp).toBeLessThan(b.mhp);
    expect(b.status).toBe('heavy');
    // dragged toward the eye of the storm
    expect(Math.abs(b.x - eye)).toBeLessThan(gap0);
  });

  it('Brak: Gauntlet Pound hits in an arc and leaves the target heavy', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'brak');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1100; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    const hp0 = b.hp;
    castAbility(w, a, getFighter('brak').attack, 'attack');
    expect(b.hp).toBe(hp0 - 24);
    expect(b.status).toBe('heavy');
  });

  it('Brak: Rockslide lands at the aim point and buries a standing fighter', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'brak');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1200; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('brak').ult, 'ult');
    run(w, 0.6);
    expect(b.hp).toBeLessThan(b.mhp);
    expect(b.status).toBe('heavy');
  });

  it('holding special casts the wall once, then the cooldown gates it', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'brak');
    a.x = 1000; a.y = 1000; a.aim = 0;
    w.setInput(1, inp({ spc: true }));
    run(w, 0.2);
    expect(w.walls.length).toBe(1);
    expect(a.spcCd).toBeGreaterThan(0);
    // holding it again does nothing while the cooldown runs
    run(w, 0.5);
    expect(w.walls.length).toBe(1);
  });
});
