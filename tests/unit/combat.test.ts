import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import * as C from '../../shared/sim/combat.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (seq: number, atk: boolean, ax = 1, ay = 0): SimInput => ({ seq, mx: 0, my: 0, ax, ay, atk, spc: false, ult: false });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** one shot: rising edge followed by release */
const tap = (w: World, id = 1, seq = 1) => { w.setInput(id, inp(seq, true)); w.setInput(id, inp(seq + 1, false)); };

/** two players in an open lane, B 300 units right of A */
function duel() {
  const w = new World();
  const a = w.addPlayer(1, 'A');
  const b = w.addPlayer(2, 'B');
  a.x = 1000; a.y = 1000; b.x = 1300; b.y = 1000;
  a.shield = 0; b.shield = 0;
  return { w, a, b };
}

describe('projectiles & hits', () => {
  it('a shot travels and damages the target', () => {
    const { w, b } = duel();
    tap(w);
    run(w, 1);
    expect(b.hp).toBe(C.MAX_HP - C.PROJ_DMG);
  });

  it('emits shot and hit events', () => {
    const { w } = duel();
    tap(w);
    run(w, 1);
    expect(w.events.some((e) => e.k === 'shot')).toBe(true);
    expect(w.events.some((e) => e.k === 'hit' && e.a === 1 && e.v === 2)).toBe(true);
  });

  it('does not reach beyond its range', () => {
    const { w, b } = duel();
    b.x = 1000 + C.PROJ_RANGE + 200;
    tap(w);
    run(w, 1.5);
    expect(b.hp).toBe(C.MAX_HP);
    expect(w.projs).toHaveLength(0);
  });

  it('walls stop projectiles', () => {
    const { w, a, b } = duel();
    // coral wall at x 560..680, y 560..680: shoot through it
    a.x = 480; a.y = 620; b.x = 800; b.y = 620;
    w.setInput(1, inp(1, true));
    run(w, 1);
    expect(b.hp).toBe(C.MAX_HP);
  });

  it('a spawn shield blocks damage', () => {
    const { w, b } = duel();
    b.shield = 1;
    w.setInput(1, inp(1, true));
    run(w, 0.5);
    expect(b.hp).toBe(C.MAX_HP);
  });
});

describe('ammo & reload', () => {
  it('spends 3 ammo then reloads one every 1.2 s', () => {
    const { w, a } = duel();
    w.setInput(1, inp(1, true));
    run(w, 1);
    expect(a.ammo).toBe(0);
    w.setInput(1, inp(2, false));
    run(w, C.RELOAD_SEC + 0.1);
    expect(a.ammo).toBe(1);
    run(w, C.RELOAD_SEC * 2);
    expect(a.ammo).toBe(C.MAX_AMMO);
  });

  it('a quick tap (atk on then off) still fires once', () => {
    const { w, a } = duel();
    w.setInput(1, inp(1, true));
    w.setInput(1, inp(2, false));
    w.step();
    expect(a.ammo).toBe(C.MAX_AMMO - 1);
  });
});

describe('KO & respawn', () => {
  it('KO sets down, counts kos/deaths, respawns after 3 s with a shield', () => {
    const { w, a, b } = duel();
    b.hp = C.PROJ_DMG;
    w.setInput(1, inp(1, true));
    run(w, 0.5);
    expect(b.down).toBe(true);
    expect(a.kos).toBe(1);
    expect(b.deaths).toBe(1);
    expect(w.events.some((e) => e.k === 'ko' && e.a === 1 && e.v === 2)).toBe(true);
    w.setInput(1, inp(2, false));
    run(w, C.RESPAWN_SEC - 0.6);
    expect(b.down).toBe(true);
    run(w, 0.7);
    expect(b.down).toBe(false);
    expect(b.hp).toBe(C.MAX_HP);
    expect(b.shield).toBeGreaterThan(0);
    expect(b.shield).toBeLessThanOrEqual(C.SHIELD_SEC);
    run(w, C.SHIELD_SEC + 0.1);
    expect(b.shield).toBe(0);
  });

  it('respawns at the spawn farthest from enemies', () => {
    const { w, a, b } = duel();
    a.x = 200; a.y = 200;
    b.down = true; b.respawn = 0.01;
    w.step();
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(2000);
  });

  it('down players cannot be hit and cannot shoot', () => {
    const { w, a, b } = duel();
    b.down = true; b.respawn = 10;
    w.setInput(1, inp(1, true));
    run(w, 0.5);
    expect(b.hp).toBe(C.MAX_HP);
    a.down = true; a.respawn = 10; a.ammo = 3;
    w.setInput(1, inp(2, false));
    w.setInput(1, inp(3, true));
    run(w, 0.3);
    expect(a.ammo).toBe(3);
  });

  it('debug ops teleport and set hp', () => {
    const { w, b } = duel();
    w.debugTeleport(2, 1500, 1100);
    w.debugHp(2, 5);
    expect([b.x, b.y, b.hp]).toEqual([1500, 1100, 5]);
  });
});
