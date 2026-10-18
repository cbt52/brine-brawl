import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { DOCKS_ARENA, GALLEON_ARENA, type Arena } from '../../shared/arena/arena.ts';
import { GALLEON_CANNONS } from '../../shared/arena/galleon.ts';
import { CANNON_DMG } from '../../shared/sim/cannon.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });

/** Step the world until `sec` seconds of sim time have passed. */
function runTo(w: World, sec: number): void {
  while (w.tick / TICK_HZ < sec) w.step();
}

// Cannon 0 sits at (120, 420) and fires along +x; its first volley fires at t = 2.5 s, the next at 7.5 s.
const LANE_X = 600;
const LANE_Y = 420;

describe('World on a swappable arena (backlog #1 slice 3a)', () => {
  it('spawns fighters on the arena the world was built with', () => {
    const arena: Arena = { obstacles: [], spawns: [{ x: 500, y: 700 }], cannons: [] };
    const w = new World(arena);
    const p = w.addPlayer(1, 'a');
    expect([p.x, p.y]).toEqual([500, 700]);
  });

  it('defaults to the docks layout', () => {
    expect(new World().arena).toBe(DOCKS_ARENA);
    expect(new World(GALLEON_ARENA).arena.cannons).toBe(GALLEON_CANNONS);
  });

  it('stops walkers at the arena obstacles, not the docks coral', () => {
    // a single tall wall at x 600–650 blocks a walk to the right
    const wall = { x: 600, y: 0, w: 50, h: 1600 };
    const w = new World({ obstacles: [wall], spawns: [{ x: 400, y: 800 }], cannons: [] });
    const p = w.addPlayer(1, 'a');
    p.input = inp({ mx: 1 });
    runTo(w, 2);
    expect(p.x).toBeLessThan(wall.x);
    expect(p.x).toBeGreaterThan(400);
  });

  it('a cannon bar in the lane hits the body once per volley', () => {
    const w = new World(GALLEON_ARENA);
    const p = w.addPlayer(1, 'a');
    p.x = LANE_X;
    p.y = LANE_Y;
    const hp0 = p.hp;
    runTo(w, 6);
    expect(hp0 - p.hp).toBe(CANNON_DMG);
  });

  it('the next volley hits again, so two volleys cost two hits', () => {
    const w = new World(GALLEON_ARENA);
    const p = w.addPlayer(1, 'a');
    p.x = LANE_X;
    p.y = LANE_Y;
    const hp0 = p.hp;
    runTo(w, 8.5);
    expect(hp0 - p.hp).toBe(2 * CANNON_DMG);
  });

  it('a body out of the lane is never hit', () => {
    const w = new World(GALLEON_ARENA);
    const p = w.addPlayer(1, 'a');
    p.x = LANE_X;
    p.y = 700;
    const hp0 = p.hp;
    runTo(w, 8.5);
    expect(p.hp).toBe(hp0);
  });

  it('the docks layout has no cannons, so nothing fires there', () => {
    const w = new World();
    const p = w.addPlayer(1, 'a');
    p.x = LANE_X;
    p.y = LANE_Y;
    const hp0 = p.hp;
    runTo(w, 8.5);
    expect(p.hp).toBe(hp0);
  });
});
