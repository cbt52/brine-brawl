import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { DOCKS_ARENA, GALLEON_ARENA, arenaById, type Arena } from '../../shared/arena/arena.ts';
import { GALLEON_CANNONS, GALLEON_OBSTACLES } from '../../shared/arena/galleon.ts';
import { CANNON_DMG } from '../../shared/sim/cannon.ts';
import { makePurrl, stepPurrl } from '../../shared/sim/purrl.ts';
import { canSee } from '../../shared/sim/visibility.ts';
import { replay } from '../../client/src/net/predict.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { steer } from '../../shared/sim/bot.ts';
import { getFighter } from '../../shared/fighters/index.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });

/** A test layout: dry (no pools, no kelp) with just the given scenery and spawn points. */
const layout = (o: Pick<Arena, 'obstacles' | 'spawns'>): Arena => ({ id: 'docks', cannons: [], shallows: [], bushes: [], ...o });

/** Step the world until `sec` seconds of sim time have passed. */
function runTo(w: World, sec: number): void {
  while (w.tick / TICK_HZ < sec) w.step();
}

// Cannon 0 sits at (120, 420) and fires along +x; its first volley fires at t = 2.5 s, the next at 7.5 s.
const LANE_X = 600;
const LANE_Y = 420;

describe('World on a swappable arena (backlog #1 slice 3a)', () => {
  it('spawns fighters on the arena the world was built with', () => {
    const arena = layout({ obstacles: [], spawns: [{ x: 500, y: 700 }] });
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
    const w = new World(layout({ obstacles: [wall], spawns: [{ x: 400, y: 800 }] }));
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

  it('a cannon hit event is tagged src: cannon, so the client can tell it from a burn tick (backlog #39)', () => {
    const w = new World(GALLEON_ARENA);
    const p = w.addPlayer(1, 'a');
    p.x = LANE_X;
    p.y = LANE_Y;
    runTo(w, 6);
    const hits = w.events.filter((e) => e.k === 'hit' && e.v === p.id);
    expect(hits).toEqual([expect.objectContaining({ a: -1, dmg: CANNON_DMG, src: 'cannon' })]);
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

describe('arena scenery in bots and abilities (backlog #26 slice 3b)', () => {
  it('bots steer around the arena obstacles, so a galleon wall turns the heading', () => {
    const o = GALLEON_OBSTACLES[0];
    const w = new World(GALLEON_ARENA);
    const me = w.addPlayer(1, 'a');
    // square in front of the wall, aiming straight into it
    me.x = o.x - 60;
    me.y = o.y + o.h / 2;
    expect(steer(me, 0, [])).toBe(0);
    expect(steer(me, 0, GALLEON_OBSTACLES)).not.toBe(0);
  });

  it('a dash stops at an obstacle of its own arena (not the docks coral)', () => {
    const wall = { x: 1250, y: 900, w: 60, h: 200 };
    const w = new World(layout({ obstacles: [wall], spawns: [{ x: 1000, y: 1000 }] }));
    const a = w.addPlayer(1, 'A', 'embercub'); // Ember Roll: 300 u dash along the aim
    a.x = 1000; a.y = 1000; a.aim = 0; a.shield = 0;
    expect(castAbility(w, a, getFighter('embercub').special, 'special')).toBe(true);
    runTo(w, 0.6);
    expect(a.x).toBeGreaterThan(1000);
    expect(a.x).toBeLessThan(wall.x);
  });
});

describe('the match layout drives tide, kelp, snail and prediction (backlog #26 slice 3c-1)', () => {
  it('the galleon deck is dry and has no kelp; unknown ids fall back to the docks', () => {
    expect(GALLEON_ARENA.shallows).toEqual([]);
    expect(GALLEON_ARENA.bushes).toEqual([]);
    expect(DOCKS_ARENA.shallows.length).toBeGreaterThan(0);
    expect(DOCKS_ARENA.bushes.length).toBeGreaterThan(0);
    expect(arenaById('galleon')).toBe(GALLEON_ARENA);
    expect(arenaById('docks')).toBe(DOCKS_ARENA);
    expect(arenaById('nope')).toBe(DOCKS_ARENA);
    expect(arenaById(undefined)).toBe(DOCKS_ARENA);
  });

  it('a high tide floods the docks pools but not the galleon deck', () => {
    const docks = new World(DOCKS_ARENA);
    docks.debugTide('high');
    expect(docks.inWaterAt(1200, 800)).toBe(true);
    const galleon = new World(GALLEON_ARENA);
    galleon.debugTide('high');
    expect(galleon.inWaterAt(1200, 800)).toBe(false);
  });

  it('kelp hides a fighter only on the layout that has it', () => {
    const viewer = { id: 1, x: 1500, y: 1300 }; // far from the docks kelp at (310, 890)
    const hidden = { id: 2, x: 310, y: 890 };
    expect(canSee(viewer, hidden, [], DOCKS_ARENA.bushes)).toBe(false);
    expect(canSee(viewer, hidden, [], GALLEON_ARENA.bushes)).toBe(true);
  });

  it('the snail never swims into the galleon coral', () => {
    const s = makePurrl(5);
    const start = { x: s.x, y: s.y };
    for (let i = 0; i < 30 * 600; i++) {
      stepPurrl(s, 1 / TICK_HZ, GALLEON_ARENA);
      for (const r of GALLEON_OBSTACLES) {
        const inside = s.x > r.x && s.x < r.x + r.w && s.y > r.y && s.y < r.y + r.h;
        if (inside) throw new Error(`snail inside ${JSON.stringify(r)} at ${s.x},${s.y} (tick ${i})`);
      }
    }
    expect(Math.hypot(s.x - start.x, s.y - start.y)).toBeGreaterThan(0);
  });

  it('prediction blocks on the galleon hatch, but runs free on the docks', () => {
    // straight down from (1000, 100): the galleon hatch (y 300–340, x 900–1100) stops the body above it
    const down = Array.from({ length: 60 }, (_, i) => ({ seq: i + 1, mx: 0, my: 1 }));
    const galleon = replay({ x: 1000, y: 100 }, 32, down, 300, 0, undefined, undefined, GALLEON_ARENA);
    expect(galleon.y).toBeLessThan(300 - 32 + 1);
    const docks = replay({ x: 1000, y: 100 }, 32, down, 300, 0, undefined, undefined, DOCKS_ARENA);
    expect(docks.y).toBeGreaterThan(600);
  });
});
