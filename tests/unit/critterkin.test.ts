import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { getFighter, SELECTABLE } from '../../shared/fighters/index.ts';
import { hasStatus, statusMask } from '../../shared/fighters/types.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** The Critterkin trio of CP8: Gloomoth, Pebblor, Dozelump. */
describe('Critterkin roster (CP8)', () => {
  it('all three are selectable with their own kit', () => {
    const ids = SELECTABLE.map((f) => f.id);
    for (const id of ['gloomoth', 'pebblor', 'dozelump']) expect(ids).toContain(id);
    const g = getFighter('gloomoth');
    const p = getFighter('pebblor');
    const d = getFighter('dozelump');
    expect([g.name, p.name, d.name]).toEqual(['Gloomoth', 'Pebblor', 'Dozelump']);
    expect([g.element, p.element, d.element]).toEqual(['air', 'earth', 'water']);
    for (const f of [g, p, d]) {
      expect(f.faction).toBe('critterkin');
      expect(f.special.cd).toBeGreaterThan(0);
    }
    expect(g.special.kind).toBe('burrow');
    expect(p.special.kind).toBe('buff');
    expect(d.special.kind).toBe('buff');
  });

  it('Gloomoth: Dust Puff hits the cone and leaves the victim Heavy', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'gloomoth');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1120; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('gloomoth').attack, 'attack');
    expect(b.hp).toBe(b.mhp - 13); // T33: dust puff 9 → 13
    expect(hasStatus(statusMask(b.status), 'heavy')).toBe(true);
  });

  it('Gloomoth: Dust Puff misses a target outside the cone', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'gloomoth');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1000; b.y = 1150; b.aim = -Math.PI / 2;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('gloomoth').attack, 'attack');
    expect(b.hp).toBe(b.mhp);
    expect(b.status).toBeNull();
  });

  it('Gloomoth: Phase Flutter blinks along the aim and is untargetable on the way', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'gloomoth');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 800; a.aim = 0;
    b.x = 1080; b.y = 800; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('gloomoth').special, 'special');
    expect(a.burrow).not.toBeNull();
    // the buried moth cannot be shot
    w.damage(b.id, a, 30, a.x, a.y);
    expect(a.hp).toBe(a.mhp);
    run(w, 0.9);
    expect(a.burrow).toBeNull();
    expect(a.x).toBeCloseTo(1250, 0);
    expect(a.y).toBeCloseTo(800, 0);
  });

  it('Gloomoth: Lantern Swarm sends 5 homing moths that curve onto a target beside the aim', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'gloomoth');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = -Math.PI / 2; // facing away from the victim
    b.x = 1180; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('gloomoth').ult, 'ult');
    expect(w.projs.length).toBe(5);
    expect(w.projs.every((pr) => pr.homing)).toBe(true);
    const hp0 = b.hp;
    run(w, 1.6);
    expect(b.hp).toBeLessThan(hp0);
  });

  it('Pebblor: Pebble Lob arcs over the coral wall and bursts Heavy on the far side', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pebblor');
    const b = w.addPlayer(2, 'B', 'default');
    // coral wall at x 380…540, y 260…320
    a.x = 460; a.y = 180; a.aim = Math.PI / 2;
    b.x = 460; b.y = 620; b.aim = -Math.PI / 2;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('pebblor').attack, 'attack');
    run(w, 0.45);
    expect(w.projs.length).toBe(1);
    expect(w.projs[0].y).toBeGreaterThan(320); // past the wall it would have hit
    const hp0 = b.hp;
    run(w, 1.0);
    expect(b.hp).toBeLessThan(hp0);
    expect(hasStatus(statusMask(b.status), 'heavy')).toBe(true);
  });

  it('Pebblor: Hunker turns to stone — nothing lands for a second, then damage returns', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pebblor');
    const b = w.addPlayer(2, 'B', 'default');
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('pebblor').special, 'special');
    w.damage(b.id, a, 30, a.x, a.y);
    expect(a.hp).toBe(a.mhp);
    run(w, 1.2);
    w.damage(b.id, a, 30, a.x, a.y);
    expect(a.hp).toBe(a.mhp - 30);
  });

  it('Pebblor: Avalanche Egg rolls through both fighters in its path', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pebblor');
    const b = w.addPlayer(2, 'B', 'default');
    const c = w.addPlayer(3, 'C', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1150; b.y = 1000; b.aim = Math.PI;
    c.x = 1350; c.y = 1000; c.aim = Math.PI;
    a.shield = 0; b.shield = 0; c.shield = 0;
    castAbility(w, a, getFighter('pebblor').ult, 'ult');
    run(w, 1.0);
    expect(b.hp).toBe(b.mhp - 18); // T33: avalanche egg 26 → 18
    expect(c.hp).toBe(c.mhp - 18);
  });

  it('Dozelump: Belly Bump shoves the target away', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'dozelump');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1120; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('dozelump').attack, 'attack');
    expect(b.hp).toBe(b.mhp - 23); // T33: belly bump 14 → 23
    expect(b.x).toBeGreaterThan(1120);
    expect(b.x).toBeLessThan(1120 + 240); // one shove, then normal control
  });

  it('Dozelump: Snooze heals 40 but roots for the whole snooze (T33: 1.2 s)', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'dozelump');
    a.x = 1000; a.y = 1000;
    a.shield = 0;
    a.hp = 80;
    castAbility(w, a, getFighter('dozelump').special, 'special');
    expect(a.hp).toBe(120);
    w.setInput(a.id, inp({ mx: 1, my: 0 }));
    const x0 = a.x;
    run(w, 1.1);
    expect(a.x).toBeCloseTo(x0, 5); // still planted
    run(w, 0.9); // buff over
    expect(a.x).toBeGreaterThan(x0 + 20);
  });

  it('Dozelump: Body Slam lands on the aim point and hits everyone in the splash', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'dozelump');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = Math.PI / 2;
    b.x = 1000; b.y = 1300; b.aim = -Math.PI / 2;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('dozelump').ult, 'ult');
    run(w, 0.5);
    expect(a.burrow).toBeNull();
    expect(a.y).toBeGreaterThanOrEqual(1330); // aim 330 u down
    expect(a.y).toBeLessThan(1330 + 40);
    expect(b.hp).toBe(b.mhp - 22);
  });
});
