import { describe, it, expect } from 'vitest';
import { WORLD_W, WORLD_H } from '../../shared/constants.ts';
import { type Rect } from '../../shared/arena/docks.ts';
import { GALLEON_OBSTACLES, GALLEON_SPAWNS, GALLEON_CANNONS } from '../../shared/arena/galleon.ts';
import { SHOT_WIDTH, shotLife, CANNON_WARN_SEC } from '../../shared/sim/cannon.ts';

const R = 22; // fighter radius

/** Is the circle (x,y,r) overlapping any rect? */
function touches(rects: Rect[], x: number, y: number, r: number): boolean {
  return rects.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
}

describe('Taffy Galleon deck layout (backlog #1 slice 2)', () => {
  it('has 12 mirrored obstacles, all inside the world', () => {
    expect(GALLEON_OBSTACLES).toHaveLength(12);
    for (const o of GALLEON_OBSTACLES) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.x + o.w).toBeLessThanOrEqual(WORLD_W);
      expect(o.y + o.h).toBeLessThanOrEqual(WORLD_H);
    }
  });

  it('every spawn stands on clear deck, with a fighter body of room around it', () => {
    expect(GALLEON_SPAWNS).toHaveLength(8);
    for (const s of GALLEON_SPAWNS) {
      expect(touches(GALLEON_OBSTACLES, s.x, s.y, R + 10)).toBe(false);
      expect(s.x).toBeGreaterThan(R);
      expect(s.x).toBeLessThan(WORLD_W - R);
      expect(s.y).toBeGreaterThan(R);
      expect(s.y).toBeLessThan(WORLD_H - R);
    }
  });

  it('is mirror-symmetric left/right and top/bottom, like the docks', () => {
    const key = (r: Rect) => `${r.x},${r.y},${r.w},${r.h}`;
    const set = new Set(GALLEON_OBSTACLES.map(key));
    for (const o of GALLEON_OBSTACLES) {
      expect(set.has(key({ ...o, x: WORLD_W - o.x - o.w }))).toBe(true);
      expect(set.has(key({ ...o, y: WORLD_H - o.y - o.h }))).toBe(true);
    }
  });

  it('cannon muzzles sit on clear deck and their bars run the full range inside the world', () => {
    expect(GALLEON_CANNONS).toHaveLength(4);
    for (const c of GALLEON_CANNONS) {
      expect(touches(GALLEON_OBSTACLES, c.x, c.y, R)).toBe(false);
      const headX = c.x + Math.cos(c.a) * c.range;
      const headY = c.y + Math.sin(c.a) * c.range;
      expect(headX).toBeGreaterThanOrEqual(0);
      expect(headX).toBeLessThanOrEqual(WORLD_W);
      expect(headY).toBeGreaterThanOrEqual(0);
      expect(headY).toBeLessThanOrEqual(WORLD_H);
    }
  });

  it('every cannon period leaves room for one full volley, so a gun never overlaps itself', () => {
    for (const c of GALLEON_CANNONS) {
      expect(c.period).toBeGreaterThan(CANNON_WARN_SEC + shotLife(c.range));
    }
  });

  it('cannon lanes stay clear of obstacles, so the bar never hides behind a mast or crate', () => {
    for (const c of GALLEON_CANNONS) {
      const lane: Rect = c.a === 0
        ? { x: c.x, y: c.y - SHOT_WIDTH / 2, w: c.range, h: SHOT_WIDTH }
        : { x: c.x - c.range, y: c.y - SHOT_WIDTH / 2, w: c.range, h: SHOT_WIDTH };
      const hit = GALLEON_OBSTACLES.some((o) =>
        o.x < lane.x + lane.w && o.x + o.w > lane.x && o.y < lane.y + lane.h && o.y + o.h > lane.y);
      expect(hit).toBe(false);
    }
  });
});
