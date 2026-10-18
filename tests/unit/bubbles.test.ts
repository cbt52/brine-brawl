import { describe, it, expect } from 'vitest';
import { World, stepMove, type SimInput } from '../../shared/sim/world.ts';
import { replay } from '../../client/src/net/predict.ts';
import { OBSTACLES } from '../../shared/arena/docks.ts';
import {
  BUBBLE_COUNT, BUBBLE_LIFT, BUBBLE_R, BUBBLE_RISE, BUBBLE_SLOW, inBubble, makeBubbles, stepBubbles, type Bubble,
} from '../../shared/sim/bubbles.ts';
import { TICK_HZ, WORLD_H, WORLD_W } from '../../shared/constants.ts';

const DT = 1 / TICK_HZ;
const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const bubble = (x: number, y: number, id = 1): Bubble => ({ id, x, y, r: BUBBLE_R });

describe('bubble storm layout', () => {
  it('lays out the bubbles inside the arena, staggered in height', () => {
    const list = makeBubbles();
    expect(list).toHaveLength(BUBBLE_COUNT);
    for (const b of list) {
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(WORLD_W);
      expect(b.y).toBeGreaterThan(0);
      expect(b.y).toBeLessThan(WORLD_H);
    }
    expect(new Set(list.map((b) => Math.round(b.y))).size).toBeGreaterThan(1);
  });

  it('gives every bubble its own id', () => {
    expect(new Set(makeBubbles().map((b) => b.id)).size).toBe(BUBBLE_COUNT);
  });
});

describe('bubble motion', () => {
  it('rises at BUBBLE_RISE units per second', () => {
    const list = [bubble(500, 800)];
    stepBubbles(list, 1);
    expect(list[0].y).toBeCloseTo(800 - BUBBLE_RISE, 5);
  });

  it('re-enters at the bottom edge once it leaves the top', () => {
    const list = [bubble(500, -BUBBLE_R + 1)];
    stepBubbles(list, DT * 2);
    expect(list[0].y).toBeGreaterThan(WORLD_H);
  });
});

describe('bubble overlap', () => {
  it('counts a body whose circle touches a bubble', () => {
    const list = [bubble(500, 500)];
    expect(inBubble(list, 500, 500, 32)).toBe(true);
    expect(inBubble(list, 500 + BUBBLE_R + 31, 500, 32)).toBe(true);
  });

  it('ignores a body clear of every bubble', () => {
    const list = [bubble(500, 500)];
    expect(inBubble(list, 500 + BUBBLE_R + 33, 500, 32)).toBe(false);
    expect(inBubble([], 500, 500, 32)).toBe(false);
    expect(inBubble(undefined, 500, 500, 32)).toBe(false);
  });
});

describe('bubble carry in stepMove', () => {
  it('leaves the walk alone when no bubble is near', () => {
    const p = { x: 1000, y: 1000, r: 32 };
    stepMove(p, 1, 0, 100, DT, OBSTACLES);
    expect(p.x).toBeCloseTo(1000 + 100 * DT, 5);
    expect(p.y).toBeCloseTo(1000, 5);
  });

  it('slows the walk and carries the body up inside a bubble', () => {
    const p = { x: 1000, y: 1000, r: 32 };
    stepMove(p, 1, 0, 100, DT, OBSTACLES, undefined, [bubble(1000, 1000)]);
    expect(p.x).toBeCloseTo(1000 + 100 * DT * BUBBLE_SLOW, 5);
    expect(p.y).toBeCloseTo(1000 - BUBBLE_LIFT * DT, 5);
  });

  it('a body standing still in a bubble is still carried up', () => {
    const p = { x: 1000, y: 1000, r: 32 };
    stepMove(p, 0, 0, 100, DT, OBSTACLES, undefined, [bubble(1000, 1000)]);
    expect(p.y).toBeCloseTo(1000 - BUBBLE_LIFT * DT, 5);
  });
});

describe('bubble storm in the sim', () => {
  it('a calm world has no bubbles and sends none in the snapshot', () => {
    const w = new World();
    expect(w.bubbles).toEqual([]);
    expect(w.snapshotFor(0).bb).toBeUndefined();
  });

  it('a bubble-storm round lays bubbles out and sends them in the snapshot', () => {
    const w = new World();
    w.setWeather('bubble-storm');
    expect(w.bubbles).toHaveLength(BUBBLE_COUNT);
    expect(w.snapshotFor(0).bb).toHaveLength(BUBBLE_COUNT);
  });

  it('switching back to calm skies clears the bubbles', () => {
    const w = new World();
    w.setWeather('bubble-storm');
    w.setWeather('clear');
    expect(w.bubbles).toEqual([]);
  });

  it('a fighter inside a bubble walks slower than the same fighter outside one', () => {
    const calm = new World();
    const wild = new World();
    calm.addPlayer(1, 'a');
    wild.addPlayer(1, 'a');
    wild.setWeather('bubble-storm');
    // park the one bubble right on the fighter, so the rest of the storm cannot change the walk
    const body = wild.players.get(1)!;
    wild.bubbles = [bubble(body.x, body.y)];
    calm.setInput(1, inp({ mx: 1 }));
    wild.setInput(1, inp({ mx: 1 }));
    const x0 = body.x;
    calm.step();
    wild.step();
    const dxCalm = calm.players.get(1)!.x - x0;
    const dxWild = body.x - x0;
    expect(dxWild).toBeGreaterThan(0);
    expect(dxWild).toBeLessThan(dxCalm);
  });
});

describe('bubble storm in prediction', () => {
  it('the client replay carries and slows the body exactly like the server step', () => {
    const list = [bubble(1000, 1000)];
    const local = replay({ x: 1000, y: 1000 }, 32, [{ seq: 1, mx: 1, my: 0 }], 100, 0, undefined, list);
    const server = { x: 1000, y: 1000, r: 32 };
    stepMove(server, 1, 0, 100, DT, OBSTACLES, undefined, list);
    expect(local.x).toBeCloseTo(server.x, 5);
    expect(local.y).toBeCloseTo(server.y, 5);
  });
});
