import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { makePurrl, PURRL_HEAL, PURRL_SPEED, stepPurrl } from '../../shared/sim/purrl.ts';
import * as C from '../../shared/sim/combat.ts';
import { OBSTACLES, SHALLOWS } from '../../shared/arena/docks.ts';
import { TICK_HZ, WORLD_W, WORLD_H } from '../../shared/constants.ts';

const run = (w: World, sec: number) => { for (let i = 0; i < Math.round(sec * TICK_HZ); i++) w.step(); };

/** Park the snail right on a fighter so the next tick is a touch. */
const onTop = (w: World, id: number) => {
  const p = w.players.get(id)!;
  w.purrl.x = p.x;
  w.purrl.y = p.y;
};

const heals = (w: World) => w.events.filter((e) => e.k === 'purrl');

const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

describe('Purrl: the wandering sea snail (backlog #1)', () => {
  it('wanders the sand: it moves, stays in the world, and never sits on coral or in the flood', () => {
    const s = makePurrl(3);
    let moved = 0;
    let px = s.x;
    let py = s.y;
    for (let i = 0; i < 600 * TICK_HZ; i++) {
      stepPurrl(s, 1 / TICK_HZ);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(WORLD_W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(WORLD_H);
      expect(OBSTACLES.some((r) => inside(s.x, s.y, r))).toBe(false);
      expect(SHALLOWS.some((r) => inside(s.x, s.y, r))).toBe(false);
      moved += Math.hypot(s.x - px, s.y - py);
      px = s.x;
      py = s.y;
    }
    // ten minutes of legs and rests: it really goes places, at snail speed
    expect(moved).toBeGreaterThan(500);
    expect(moved).toBeLessThanOrEqual(PURRL_SPEED * 600 + 1);
  });

  it('the route is seeded: the same seed walks the same legs', () => {
    const a = makePurrl(11);
    const b = makePurrl(11);
    for (let i = 0; i < 20 * TICK_HZ; i++) {
      stepPurrl(a, 1 / TICK_HZ);
      stepPurrl(b, 1 / TICK_HZ);
    }
    expect([a.x, a.y, a.a]).toEqual([b.x, b.y, b.a]);
  });

  it('heals a hurt fighter it bumps into, and reports the heal', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    const p = w.players.get(1)!;
    p.hp = p.mhp - 30;
    onTop(w, 1);
    w.events.length = 0;
    w.step();
    expect(p.hp).toBe(p.mhp - 30 + PURRL_HEAL);
    expect(heals(w)).toEqual([expect.objectContaining({ k: 'purrl', v: 1, n: PURRL_HEAL })]);
  });

  it('the heal event sits on the fighter, not on the snail, so the ring and pop land on them', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    const p = w.players.get(1)!;
    p.hp = p.mhp - 30;
    onTop(w, 1);
    w.purrl.x = p.x + 12;
    w.purrl.y = p.y;
    w.purrl.pause = 99;
    w.events.length = 0;
    w.step();
    expect(heals(w)).toEqual([expect.objectContaining({ x: Math.round(p.x), y: Math.round(p.y) })]);
  });

  it('a fighter gets only one heal per life', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    const p = w.players.get(1)!;
    p.hp = p.mhp - 30;
    onTop(w, 1);
    w.step();
    const after = p.hp;
    p.hp = p.mhp - 30;
    onTop(w, 1);
    w.events.length = 0;
    w.step();
    expect(p.hp).toBe(p.mhp - 30);
    expect(heals(w)).toHaveLength(0);
    expect(after).toBe(p.mhp - 20);
  });

  it('a full-health fighter keeps the heal for when they are hurt', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    const p = w.players.get(1)!;
    onTop(w, 1);
    w.step();
    expect(p.purrlFed).toBe(false);
    p.hp = p.mhp - 30;
    onTop(w, 1);
    w.step();
    expect(p.hp).toBe(p.mhp - 20);
    expect(p.purrlFed).toBe(true);
  });

  it('caps the heal at max HP and reports only what was actually restored', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    const p = w.players.get(1)!;
    p.hp = p.mhp - 4;
    onTop(w, 1);
    w.events.length = 0;
    w.step();
    expect(p.hp).toBe(p.mhp);
    expect(heals(w)).toEqual([expect.objectContaining({ v: 1, n: 4 })]);
  });

  it('a respawn brings the heal back for the new life', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    const p = w.players.get(1)!;
    p.hp = p.mhp - 30;
    onTop(w, 1);
    w.step();
    expect(p.purrlFed).toBe(true);
    p.toonUsed = true; // spend the Toon Logic flatten so the KO really lands
    w.debugKill(1);
    run(w, C.RESPAWN_SEC + 0.5);
    expect(p.down).toBe(false);
    expect(p.purrlFed).toBe(false);
    p.hp = p.mhp - 30;
    onTop(w, 1);
    w.step();
    expect(p.hp).toBe(p.mhp - 20);
  });

  it('a KO\'d fighter is not healed by the snail', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    const p = w.players.get(1)!;
    p.toonUsed = true; // spend the Toon Logic flatten so the KO really lands
    w.debugKill(1);
    expect(p.down).toBe(true);
    onTop(w, 1);
    w.events.length = 0;
    w.step();
    expect(heals(w)).toHaveLength(0);
    expect(p.purrlFed).toBe(false);
  });

  it('the snapshot carries Purrl position and facing', () => {
    const w = new World();
    w.addPlayer(1, 'a', 'default');
    run(w, 2);
    const snap = w.snapshotFor(1);
    expect(snap.purrl).toEqual({
      x: Math.round(w.purrl.x), y: Math.round(w.purrl.y), a: Math.round((w.purrl.a * 180) / Math.PI),
    });
  });
});
