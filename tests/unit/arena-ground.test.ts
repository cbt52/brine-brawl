import { describe, it, expect } from 'vitest';
import { WORLD_W, WORLD_H } from '../../shared/constants.ts';
import { DOCKS_ARENA, GALLEON_ARENA } from '../../shared/arena/arena.ts';
import { DECOR, SPAWNS, type Rect } from '../../shared/arena/docks.ts';
import { arenaLayout, decksFor, GROUND_SCALE } from '../../scripts/lib/arena-layout.ts';
import { saturation, saturationStats } from '../../scripts/lib/ground-stats.mjs';
import { debugRects, groundKey, groundUrl, rectsWanted } from '../../client/src/art/ground.ts';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

describe('ground layout (T42)', () => {
  const L = arenaLayout('docks');

  it('exports the docks collision rects unchanged, at 0.75× output size', () => {
    expect(L.obstacles).toEqual(DOCKS_ARENA.obstacles);
    expect(L.shallows).toEqual(DOCKS_ARENA.shallows);
    expect(L.bushes).toEqual(DOCKS_ARENA.bushes);
    expect(L.decor).toEqual(DECOR);
    expect(L.out).toEqual({ w: WORLD_W * GROUND_SCALE, h: WORLD_H * GROUND_SCALE });
    expect(L.out).toEqual({ w: 1800, h: 1200 });
    expect(() => arenaLayout('galleon')).toThrow(/only docks/);
  });

  it('puts every spawn on a plank deck: 4 edge piers + 4 corner pads, mirrored', () => {
    expect(L.piers).toHaveLength(4);
    expect(L.pads).toHaveLength(4);
    const decks: Rect[] = [...L.piers, ...L.pads];
    for (const s of SPAWNS) expect(decks.some((d) => inside(s, d)), `spawn ${s.x},${s.y}`).toBe(true);
    for (const d of decks) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.x + d.w).toBeLessThanOrEqual(WORLD_W);
      expect(d.y + d.h).toBeLessThanOrEqual(WORLD_H);
      const m = { x: WORLD_W - d.x - d.w, y: WORLD_H - d.y - d.h, w: d.w, h: d.h };
      expect(decks.some((o) => o.x === m.x && o.y === m.y && o.w === m.w && o.h === m.h)).toBe(true);
    }
  });

  it('keeps decks clear of walls, pools, kelp and barrels', () => {
    for (const d of [...L.piers, ...L.pads]) {
      for (const r of [...L.obstacles, ...L.shallows, ...L.bushes, ...L.decor]) expect(overlaps(d, r)).toBe(false);
    }
  });

  it('decksFor: a pier reaches from the nearest edge past the spawn, along the right axis', () => {
    const { piers, pads } = decksFor([{ x: 1200, y: 160 }, { x: 2240, y: 800 }]);
    expect(pads).toEqual([]);
    expect(piers[0]).toEqual({ x: 1110, y: 0, w: 180, h: 260, dir: 'y' });
    expect(piers[1]).toEqual({ x: 2140, y: 710, w: 260, h: 180, dir: 'x' });
  });
});

describe('ground saturation stats', () => {
  it('saturation is HSV S', () => {
    expect(saturation(255, 0, 0)).toBe(1);
    expect(saturation(128, 128, 128)).toBe(0);
    expect(saturation(0, 0, 0)).toBe(0);
    expect(saturation(200, 100, 100)).toBeCloseTo(0.5, 6);
  });

  it('p95 / max / black over RGB and RGBA buffers', () => {
    const px: number[] = [];
    for (let i = 0; i < 19; i++) px.push(200, 150, 100);
    px.push(0, 0, 0);
    const st = saturationStats({ data: Buffer.from(px), channels: 3 });
    expect(st.p95).toBeCloseTo(0.5, 2);
    expect(st.max).toBeCloseTo(0.5, 6);
    expect(st.black).toBe(1);
    expect(saturationStats({ data: Buffer.from([255, 0, 0, 255, 100, 100, 100, 255]) }).max).toBe(1);
  });
});

describe('client ground hooks', () => {
  it('keys and urls', () => {
    expect(groundKey('docks')).toBe('ground-docks');
    expect(groundUrl('docks')).toBe('/art/arena/docks-ground.jpg');
  });

  it('?rects=1 toggles the debug outlines', () => {
    expect(rectsWanted('?rects=1')).toBe(true);
    expect(rectsWanted('?room=a&rects=1')).toBe(true);
    expect(rectsWanted('?rects=0')).toBe(false);
    expect(rectsWanted('')).toBe(false);
  });

  it('debugRects covers walls, pools, kelp and (docks only) barrels/crates', () => {
    const a = DOCKS_ARENA;
    expect(debugRects(a)).toHaveLength(a.obstacles.length + a.shallows.length + a.bushes.length + DECOR.length);
    expect(debugRects(GALLEON_ARENA)).toHaveLength(GALLEON_ARENA.obstacles.length);
  });
});
