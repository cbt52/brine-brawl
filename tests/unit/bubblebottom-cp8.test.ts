import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { getFighter, SELECTABLE } from '../../shared/fighters/index.ts';
import { hasStatus, statusMask } from '../../shared/fighters/types.ts';
import { canSee } from '../../shared/sim/visibility.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** The Bubblebottom trio of CP8: Lumpy, Squall Mopefin, Teeny Krill. */
describe('Bubblebottom roster (CP8)', () => {
  it('all three are selectable with a cooldown on their special', () => {
    const ids = SELECTABLE.map((f) => f.id);
    for (const id of ['lumpy', 'squall', 'krill']) expect(ids).toContain(id);
    const l = getFighter('lumpy');
    const s = getFighter('squall');
    const k = getFighter('krill');
    expect([l.name, s.name, k.name]).toEqual(['Lumpy', 'Squall Mopefin', 'Teeny Krill']);
    expect([l.element, s.element, k.element]).toEqual(['earth', 'air', 'volt']);
    for (const kit of [l, s, k]) {
      expect(kit.faction).toBe('bubblebottom');
      expect(kit.special.cd).toBeGreaterThan(0);
    }
  });

  it('Lumpy: Flop Slap lands heavy', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lumpy', 'lumpy');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1140; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('lumpy').attack, 'attack');
    expect(b.hp).toBeLessThan(b.mhp);
    expect(hasStatus(statusMask(b.status), 'heavy')).toBe(true);
  });

  it('Lumpy: Rock Nap shrugs off a hit that would have killed him and pins him in place', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lumpy', 'lumpy');
    const foe = w.addPlayer(2, 'Foe', 'default');
    a.x = 1000; a.y = 1000;
    a.shield = 0;
    castAbility(w, w.players.get(1)!, getFighter('lumpy').special, 'special');
    const x0 = a.x; const y0 = a.y;
    w.damage(foe.id, a, 500, a.x, a.y);
    expect(a.hp).toBe(a.mhp); // nothing gets through the rock
    w.setInput(1, { seq: 1, mx: 1, my: 0, ax: 0, ay: 0, atk: false, spc: false, ult: false });
    run(w, 0.5);
    expect(a.x).toBeCloseTo(x0, 3); // rooted while napping
    expect(a.y).toBeCloseTo(y0, 3);
    run(w, 1);
    w.damage(foe.id, a, 20, a.x, a.y);
    expect(a.hp).toBe(a.mhp - 20); // rock is gone after 1.2 s
  });

  it('Lumpy: Big Nap Quake blasts the ring around him and shoves it outward', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lumpy', 'lumpy');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000;
    b.x = 1160; b.y = 1000;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('lumpy').ult, 'ult');
    run(w, 0.7);
    expect(b.hp).toBeLessThan(b.mhp);
    expect(b.x).toBeGreaterThan(1160); // pushed away from the centre
  });

  it('Squall: Sour Note is a wide cone that only hits what is in front', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Squall', 'squall');
    const front = w.addPlayer(2, 'Front', 'default');
    const behind = w.addPlayer(3, 'Behind', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    front.x = 1180; front.y = 1000;
    behind.x = 840; behind.y = 1000;
    for (const p of [a, front, behind]) p.shield = 0;
    castAbility(w, a, getFighter('squall').attack, 'attack');
    expect(front.hp).toBeLessThan(front.mhp);
    expect(behind.hp).toBe(behind.mhp);
  });

  it('Squall: Ink Cloud hides whoever sits in it from a far viewer', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Squall', 'squall');
    const hidden = w.addPlayer(2, 'Hidden', 'default');
    const viewer = w.addPlayer(3, 'Viewer', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    hidden.x = 1250; hidden.y = 1000; // on the aim point
    viewer.x = 400; viewer.y = 400; // far away
    for (const p of [a, hidden, viewer]) p.shield = 0;
    castAbility(w, a, getFighter('squall').special, 'special');
    run(w, 0.4);
    const zone = w.zones[0];
    expect(zone?.hides).toBe(true);
    expect(canSee(viewer, hidden, w.zones.filter((z) => z.hides))).toBe(false);
    expect(canSee(viewer, hidden)).toBe(true); // without the cloud he is in plain sight
    run(w, 4);
    expect(w.zones.length).toBe(0);
  });

  it('Squall: Grand Recital pulses from his feet and pushes everyone out', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Squall', 'squall');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000;
    b.x = 1200; b.y = 1000;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('squall').ult, 'ult');
    run(w, 0.6);
    expect(b.hp).toBeLessThan(b.mhp);
    expect(b.x).toBeGreaterThan(1200);
  });

  it('Krill: Laser Pew leaves a static marker', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Krill', 'krill');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1250; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('krill').attack, 'attack');
    run(w, 0.4);
    expect(b.hp).toBe(b.mhp - 13);
    expect(hasStatus(statusMask(b.status), 'static')).toBe(true);
  });

  it('Krill: Mini-Turret stands for six seconds and shoots the nearest enemy on its own', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Krill', 'krill');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1300; b.y = 1000;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('krill').special, 'special');
    expect(w.summons.length).toBe(1);
    expect(w.summons[0].kind).toBe('turret');
    const hp0 = b.hp;
    run(w, 2);
    expect(b.hp).toBeLessThan(hp0);
    expect(hasStatus(statusMask(b.status), 'static')).toBe(true);
    run(w, 4.5);
    expect(w.summons.length).toBe(0); // it packs itself up
  });

  it('Krill: Mech Max is one piercing beam through a whole line', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Krill', 'krill');
    const b = w.addPlayer(2, 'B', 'default');
    const c = w.addPlayer(3, 'C', 'default');
    a.x = 900; a.y = 1000; a.aim = 0;
    b.x = 1100; b.y = 1000;
    c.x = 1400; c.y = 1000;
    for (const p of [a, b, c]) p.shield = 0;
    castAbility(w, a, getFighter('krill').ult, 'ult');
    run(w, 0.7);
    expect(b.hp).toBeLessThan(b.mhp);
    expect(c.hp).toBeLessThan(c.mhp); // the beam did not stop at the first body
  });
});
