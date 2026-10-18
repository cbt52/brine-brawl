import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { DOCKS_ARENA, GALLEON_ARENA } from '../../shared/arena/arena.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import { SHOT_LEN, SHOT_SPEED, type Cannon, barSpan, volleyHits } from '../../shared/sim/cannon.ts';

/** Step the world until `sec` seconds of sim time have passed. */
function runTo(w: World, sec: number): void {
  while (w.tick / TICK_HZ < sec) w.step();
}

const gun: Cannon = { x: 100, y: 800, a: 0, period: 4, phase: 2, range: 1200 };

describe('cannon bar span (backlog #26)', () => {
  it('has no span while telegraphing, and starts at the muzzle when the bar leaves', () => {
    expect(barSpan(gun, { stage: 'warn', age: 0.5 })).toBeNull();
    expect(barSpan(gun, { stage: 'fire', age: 0 })).toEqual({ tail: 0, head: 0 });
  });

  it('the head runs out to the range and the tail trails it by SHOT_LEN', () => {
    const mid = barSpan(gun, { stage: 'fire', age: 1 })!;
    expect(mid.head).toBeCloseTo(SHOT_SPEED);
    expect(mid.tail).toBeCloseTo(SHOT_SPEED - SHOT_LEN);
    // the head stops at the range; once the tail passes it the bar is gone
    expect(barSpan(gun, { stage: 'fire', age: gun.range / SHOT_SPEED + 0.1 })!.head).toBe(gun.range);
    expect(barSpan(gun, { stage: 'fire', age: 10 })).toBeNull();
  });

  it('the span is exactly what volleyHits tests: inside is hit, past the head is not', () => {
    const v = { k: 0, stage: 'fire' as const, age: 1 };
    expect(volleyHits(gun, v, 100 + 600, 800, 22)).toBe(true);
    expect(volleyHits(gun, v, 100 + 900, 800, 22)).toBe(false);
    expect(volleyHits(gun, v, 100 + 400, 800, 22)).toBe(false);
  });
});

describe('cannon volleys in the snapshot (backlog #26)', () => {
  it('a galleon snapshot lists each volley on its lane, with its stage', () => {
    const w = new World(GALLEON_ARENA);
    w.addPlayer(1, 'a');
    // cannon 3 (phase 0.5 s) has fired by now; cannon 0 (phase 1.5 s) is still telegraphing
    runTo(w, 1.6);
    const cn = w.snapshotFor(1).cn ?? [];
    expect(cn.find((v) => v.i === 0)).toMatchObject({ st: 'warn' });
    expect(cn.find((v) => v.i === 3)).toMatchObject({ st: 'fire' });
    expect(cn.every((v) => v.age >= 0)).toBe(true);
  });

  it('a quiet galleon moment has no volleys, so the field is left out', () => {
    const w = new World(GALLEON_ARENA);
    w.addPlayer(1, 'a');
    // every cannon waits for its first phase (the earliest is 0.5 s in)
    runTo(w, 0.05);
    expect(w.snapshotFor(1).cn).toBeUndefined();
  });

  it('the docks has no cannons, so its snapshot never carries volleys', () => {
    const w = new World(DOCKS_ARENA);
    w.addPlayer(1, 'a');
    runTo(w, 6);
    expect(w.snapshotFor(1).cn).toBeUndefined();
  });
});
