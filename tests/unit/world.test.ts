import { describe, it, expect } from 'vitest';
import { World, BASE_SPEED, PLAYER_RADIUS, type SimInput } from '../../shared/sim/world.ts';
import { pushOutRect, clampToWorld } from '../../shared/sim/collide.ts';
import { OBSTACLES, SPAWNS } from '../../shared/arena/docks.ts';
import { WORLD_W, WORLD_H, TICK_HZ } from '../../shared/constants.ts';

const inp = (mx: number, my: number, seq = 1): SimInput => ({ seq, mx, my, ax: 1, ay: 0, atk: false, spc: false, ult: false });

function runSeconds(w: World, s: number): void {
  for (let i = 0; i < s * TICK_HZ; i++) w.step();
}

describe('arena', () => {
  it('has 10-14 walls and 8 spawns, none inside a wall', () => {
    expect(OBSTACLES.length).toBeGreaterThanOrEqual(10);
    expect(OBSTACLES.length).toBeLessThanOrEqual(14);
    expect(SPAWNS).toHaveLength(8);
    for (const s of SPAWNS) {
      const b = { x: s.x, y: s.y, r: PLAYER_RADIUS };
      for (const o of OBSTACLES) expect(pushOutRect(b, o)).toBe(false);
    }
  });
});

describe('movement', () => {
  it('moves ~speed units per second', () => {
    const w = new World();
    const p = w.addPlayer(1, 'a');
    p.x = 1200; p.y = 1000; // open lane
    w.setInput(1, inp(1, 0));
    runSeconds(w, 1);
    expect(p.x - 1200).toBeCloseTo(BASE_SPEED, 0);
  });

  it('normalizes diagonal input', () => {
    const w = new World();
    const p = w.addPlayer(1, 'a');
    p.x = 1200; p.y = 1000;
    w.setInput(1, inp(1, 1));
    runSeconds(w, 1);
    expect(Math.hypot(p.x - 1200, p.y - 1000)).toBeCloseTo(BASE_SPEED, 0);
  });

  it('clamps oversized input and ignores NaN', () => {
    const w = new World();
    const p = w.addPlayer(1, 'a');
    p.x = 1200; p.y = 1000;
    w.setInput(1, inp(50, NaN));
    runSeconds(w, 1);
    expect(p.x - 1200).toBeCloseTo(BASE_SPEED, 0);
    expect(p.y).toBe(1000);
  });

  it('stays inside world bounds', () => {
    const w = new World();
    const p = w.addPlayer(1, 'a');
    p.x = 100; p.y = 1000;
    w.setInput(1, inp(-1, 0));
    runSeconds(w, 3);
    expect(p.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    const b = { x: -500, y: 9999, r: 30 };
    clampToWorld(b);
    expect(b.x).toBe(30);
    expect(b.y).toBe(WORLD_H - 30);
    b.x = WORLD_W * 2; clampToWorld(b);
    expect(b.x).toBe(WORLD_W - 30);
  });

  it('is pushed out of walls and cannot walk through', () => {
    const w = new World();
    const o = OBSTACLES[0];
    const p = w.addPlayer(1, 'a');
    p.x = o.x - 100; p.y = o.y + o.h / 2;
    w.setInput(1, inp(1, 0));
    runSeconds(w, 2);
    expect(p.x).toBeLessThanOrEqual(o.x - PLAYER_RADIUS + 0.01);
  });

  it('push-out handles a centre inside the rect', () => {
    const o = OBSTACLES[0];
    const b = { x: o.x + 5, y: o.y + o.h / 2, r: 30 };
    expect(pushOutRect(b, o)).toBe(true);
    expect(b.x).toBe(o.x - 30);
  });

  it('separates overlapping players and reports ack + aim in the snapshot', () => {
    const w = new World();
    const a = w.addPlayer(1, 'a');
    const b = w.addPlayer(2, 'b');
    a.x = b.x = 1200; a.y = b.y = 1000;
    a.x -= 1;
    w.setInput(1, { ...inp(0, 0, 7), ax: 0, ay: 1 });
    runSeconds(w, 1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(PLAYER_RADIUS * 2 - 1);
    const snap = w.snapshotFor(1);
    expect(snap.ack).toBe(7);
    expect(snap.players.find((p) => p.id === 1)!.a).toBe(90);
  });
});
