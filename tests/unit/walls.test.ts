import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { stepWalls, wallFor } from '../../shared/sim/walls.ts';
import { getFighter } from '../../shared/fighters/index.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** Brak at (1000, 1000) aiming right; a victim stands `gap` units to the right. */
function setup(gap = 400) {
  const w = new World();
  const a = w.addPlayer(1, 'A', 'brak');
  const b = w.addPlayer(2, 'B', 'default');
  a.x = 1000; a.y = 1000; a.aim = 0;
  b.x = 1000 + gap; b.y = 1000; b.aim = Math.PI;
  a.shield = 0; b.shield = 0;
  return { w, a, b };
}

describe('wall primitive (Brak Stone Wall)', () => {
  it('spawns one slab across the aim, `range` units in front of the caster', () => {
    const { w, a } = setup();
    const def = getFighter('brak').special;
    if (def.kind !== 'wall') throw new Error('Brak special should be a wall');
    expect(castAbility(w, a, def, 'special')).toBe(true);
    expect(w.walls.length).toBe(1);
    const wall = w.walls[0];
    const spot = wallFor(a.x, a.y, a.aim, def);
    expect(spot).toMatchObject({ x: wall.x, y: wall.y, w: wall.w, h: wall.h });
    // aiming along +x → an upright slab, centred in front of the caster
    expect(wall.h).toBeGreaterThan(wall.w);
    expect(wall.x + wall.w / 2).toBeCloseTo(a.x + def.range, 0);
    expect(wall.hp).toBe(60);
  });

  it('blocks a body walking into it', () => {
    const { w, a, b } = setup();
    castAbility(w, a, getFighter('brak').special, 'special');
    w.setInput(2, inp({ mx: -1 }));
    run(w, 1.2);
    expect(w.walls.length).toBe(1);
    const slab = w.walls[0];
    // it never gets through: the body stays on its own side of the slab plus its radius
    expect(b.x).toBeGreaterThanOrEqual(slab.x + slab.w + b.r - 1);
  });

  it('blocks shots and takes their damage instead of the fighter behind it', () => {
    const { w, a, b } = setup(400);
    castAbility(w, a, getFighter('brak').special, 'special');
    const wall = w.walls[0];
    // a default-fighter shot aimed at B dies on the slab
    castAbility(w, a, getFighter('default').attack, 'attack');
    run(w, 0.6);
    expect(b.hp).toBe(b.mhp);
    expect(w.projs.length).toBe(0);
    expect(wall.hp).toBeLessThan(60);
  });

  it('crumbles at 0 hp and emits a wall event', () => {
    const { w, a } = setup();
    castAbility(w, a, getFighter('brak').special, 'special');
    const slabHp = w.walls[0].hp;
    // four full default shots (20 dmg each) eat the 60 hp slab
    for (let i = 0; i < 4; i++) {
      castAbility(w, a, getFighter('default').attack, 'attack');
      run(w, 0.5);
    }
    expect(w.walls.length).toBe(0);
    expect(slabHp).toBe(60);
    expect(w.events.some((e) => e.k === 'wall')).toBe(true);
  });

  it('expires after its 4 s lifetime', () => {
    const { w, a } = setup();
    castAbility(w, a, getFighter('brak').special, 'special');
    run(w, 3.8);
    expect(w.walls.length).toBe(1);
    run(w, 0.4);
    expect(w.walls.length).toBe(0);
    // the caster can move through where it stood
    expect(stepWalls([], 1 / TICK_HZ)).toEqual([]);
  });

  it('is sent in the snapshot with its footprint and hp', () => {
    const { w, a } = setup();
    castAbility(w, a, getFighter('brak').special, 'special');
    const snap = w.snapshotFor(1);
    expect(snap.walls?.length).toBe(1);
    expect(snap.walls?.[0]).toMatchObject({ x: w.walls[0].x, y: w.walls[0].y, w: w.walls[0].w, h: w.walls[0].h, hp: 60, mhp: 60 });
    // no walls → the field stays off the wire
    w.walls = [];
    expect(w.snapshotFor(1).walls).toBeUndefined();
  });

  it('is cleared when the round resets', () => {
    const { w, a } = setup();
    castAbility(w, a, getFighter('brak').special, 'special');
    w.resetScores();
    expect(w.walls.length).toBe(0);
  });

  it('stops a dash: Ember Roll does not cross the slab', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'embercub'); // Ember Roll: 300 u dash along the aim
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1500; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    // a slab straight across the dash lane, 120 u ahead (the dash would reach 300 u)
    const def = getFighter('brak').special;
    if (def.kind !== 'wall') throw new Error('Brak special should be a wall');
    const spot = wallFor(a.x, a.y, a.aim, { ...def, range: 120 });
    w.walls.push({ id: 999, owner: 9, ...spot, hp: 60, mhp: 60, left: 4 });
    expect(castAbility(w, a, getFighter('embercub').special, 'special')).toBe(true);
    run(w, 0.6);
    // never on the far side of the slab, never inside it
    expect(a.x).toBeLessThanOrEqual(spot.x - a.r + 1);
    expect(b.hp).toBe(b.mhp);
  });
});
