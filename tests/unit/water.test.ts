import { describe, it, expect } from 'vitest';
import { WORLD_W, WORLD_H } from '../../shared/constants.ts';
import { DOCKS_ARENA, GALLEON_ARENA } from '../../shared/arena/arena.ts';
import { ISLAND } from '../../shared/arena/shore.ts';
import { waterRects, inWater } from '../../shared/sim/tide.ts';
import { saturation } from '../../scripts/lib/ground-stats.mjs';
import { maskToTile, wrapDiff, WATER_TINT } from '../../scripts/lib/arena-water.mjs';
import {
  bubbleSize, lagoonHoles, lagoonStrips, POOL, poolLook, rimPoints, tileOffset, WATER_TILE_SCALE, waterKey,
  waterScroll, waterUrl,
} from '../../client/src/art/waterMath.ts';

const hexRgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;

describe('lagoon mask (T44)', () => {
  it('docks: the island hole stops just short of the shoreline, one hole per pier/pad', () => {
    const holes = lagoonHoles(DOCKS_ARENA)!;
    expect(holes).toHaveLength(1 + 8);
    const isle = holes[0];
    expect(isle.x).toBeLessThan(ISLAND.inset);
    expect(isle.x).toBeGreaterThan(ISLAND.inset - 20);
    expect(isle.x + isle.w).toBeCloseTo(WORLD_W - isle.x);
    expect(isle.y + isle.h).toBeCloseTo(WORLD_H - isle.y);
    // every spawn sits on a hole, so the caustics never draw under a spawning fighter
    for (const s of DOCKS_ARENA.spawns) {
      expect(holes.some((h) => s.x >= h.x && s.x <= h.x + h.w && s.y >= h.y && s.y <= h.y + h.h)).toBe(true);
    }
  });

  it('the deck has no lagoon', () => {
    expect(lagoonHoles(GALLEON_ARENA)).toBeNull();
  });

  it('the 4 strips cover the whole world border out past the island corners, without overlap', () => {
    const strips = lagoonStrips();
    const area = strips.reduce((a, r) => a + r.w * r.h, 0);
    const b = ISLAND.inset + ISLAND.radius;
    expect(area).toBe(WORLD_W * WORLD_H - (WORLD_W - 2 * b) * (WORLD_H - 2 * b));
    const inStrip = (x: number, y: number) => strips.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    // the world edge and the corner zone where the rounded island leaves water
    for (const [x, y] of [[0, 0], [WORLD_W - 1, WORLD_H - 1], [1200, 5], [5, 800], [ISLAND.inset + 40, ISLAND.inset + 40]]) {
      expect(inStrip(x, y), `${x},${y}`).toBe(true);
    }
    expect(inStrip(1200, 800)).toBe(false);
  });
});

describe('water scroll (T44)', () => {
  it('is static in lowfx and drifts otherwise', () => {
    expect(waterScroll(12_345, true)).toEqual({ x: 0, y: 0 });
    const a = waterScroll(1000, false);
    const b = waterScroll(11_000, false);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(30);
  });

  it('tile offsets line up across strips (world position / tile scale + scroll)', () => {
    const s = { x: 3, y: 4 };
    const a = tileOffset(0, 0, s);
    const b = tileOffset(300, 150, s);
    expect((b.x - a.x) * WATER_TILE_SCALE).toBeCloseTo(300);
    expect((b.y - a.y) * WATER_TILE_SCALE).toBeCloseTo(150);
  });
});

describe('flooded pools (T44)', () => {
  const pool = DOCKS_ARENA.shallows[0];

  it('dry at level 0 (no water is drawn where the sim does not slow you)', () => {
    const r = waterRects(0, [pool])[0];
    expect(poolLook(r, 0)).toBeNull();
    expect(inWater(r.x + r.w / 2, r.y + r.h / 2, 0, [pool])).toBe(false);
  });

  it('gets more opaque with a wider foam rim as the tide rises, radius within the rect', () => {
    const lo = poolLook(waterRects(0.2, [pool])[0], 0.2)!;
    const hi = poolLook(waterRects(1, [pool])[0], 1)!;
    expect(hi.alpha).toBeGreaterThan(lo.alpha);
    expect(hi.foam).toBeGreaterThan(lo.foam);
    expect(hi.tile).toBeGreaterThan(lo.tile);
    expect(hi.alpha).toBeLessThanOrEqual(1);
    const tiny = poolLook({ x: 0, y: 0, w: 30, h: 20 }, 1)!;
    expect(tiny.radius).toBeLessThanOrEqual(10);
  });

  it('pool colours stay muted (§2.11: ≤ 45 % saturation)', () => {
    for (const c of Object.values(POOL)) expect(saturation(...hexRgb(c))).toBeLessThanOrEqual(0.45);
    expect(saturation(...WATER_TINT)).toBeLessThanOrEqual(0.45);
  });

  it('rimPoints run around the rounded rect, evenly spaced, on its outline', () => {
    const r = { x: 100, y: 200, w: 400, h: 240 };
    const pts = rimPoints(r, 60, 26);
    expect(pts.length).toBeGreaterThan(40);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(r.x - 0.01);
      expect(p.x).toBeLessThanOrEqual(r.x + r.w + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(r.y - 0.01);
      expect(p.y).toBeLessThanOrEqual(r.y + r.h + 0.01);
      // on an edge or on a corner arc
      const onEdge = Math.abs(p.x - r.x) < 0.01 || Math.abs(p.x - r.x - r.w) < 0.01
        || Math.abs(p.y - r.y) < 0.01 || Math.abs(p.y - r.y - r.h) < 0.01;
      const cx = Math.min(Math.max(p.x, r.x + 60), r.x + r.w - 60);
      const cy = Math.min(Math.max(p.y, r.y + 60), r.y + r.h - 60);
      expect(onEdge || Math.abs(Math.hypot(p.x - cx, p.y - cy) - 60) < 0.01).toBe(true);
    }
    const gaps = pts.map((p, i) => Math.hypot(p.x - pts[(i + 1) % pts.length].x, p.y - pts[(i + 1) % pts.length].y));
    expect(Math.max(...gaps)).toBeLessThan(30);
    for (let i = 0; i < 20; i++) expect(bubbleSize(i)).toBeGreaterThanOrEqual(3.5);
  });
});

describe('water tile pipeline (T44)', () => {
  it('maskToTile: flat tint, grey becomes alpha', () => {
    const data = Buffer.from([0, 0, 0, 255, 200, 200, 200, 255]);
    const t = maskToTile({ w: 2, h: 1, data });
    expect([...t.data]).toEqual([...WATER_TINT, 0, ...WATER_TINT, 200]);
  });

  it('wrapDiff is 0 for a repeating 2×2 image and large for a non-repeating one', () => {
    const w = 8;
    const h = 8;
    const rep = Buffer.alloc(w * h * 4);
    const ramp = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        rep[(y * w + x) * 4] = ((x % 4) * 40 + (y % 4) * 10) & 255;
        ramp[(y * w + x) * 4] = x * 30;
      }
    }
    expect(wrapDiff({ w, h, data: rep })).toEqual({ x: 0, y: 0 });
    expect(wrapDiff({ w, h, data: ramp }).x).toBeGreaterThan(100);
  });

  it('key/url naming', () => {
    expect(waterKey('docks')).toBe('water-docks');
    expect(waterUrl('docks')).toBe('/art/arena/docks-water.png');
  });
});
