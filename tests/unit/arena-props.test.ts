import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WORLD_W, WORLD_H } from '../../shared/constants.ts';
import { DOCKS_ARENA } from '../../shared/arena/arena.ts';
import { DECOR, type Rect } from '../../shared/arena/docks.ts';
import { FOOT_TOL, footprintError, PROP_PX, propKind, propsLayout, shapeFor } from '../../scripts/lib/props-layout.ts';
import { layoutShelves } from '../../scripts/lib/pack.mjs';
import { clippedEdges } from '../../scripts/lib/arena-props.mjs';
import { KELP_DEPTH, propDepth, propsKey, propsUrl, sortDepth } from '../../client/src/art/props.ts';

const L = propsLayout('docks');
const shape = (frame: string) => L.shapes.find((s) => s.frame === frame)!;
const anchored = (r: Rect) => (p: { x: number; y: number }) => p.x === r.x + r.w / 2 && p.y === r.y + r.h;

describe('props layout (T43)', () => {
  it('places one prop on every wall, barrel/crate and kelp rect, anchored on its bottom edge', () => {
    const groups: [Rect[], string][] = [[DOCKS_ARENA.obstacles, 'wall'], [DECOR, ''], [DOCKS_ARENA.bushes, 'kelp']];
    expect(L.instances).toHaveLength(DOCKS_ARENA.obstacles.length + DECOR.length + DOCKS_ARENA.bushes.length);
    for (const [list, kind] of groups) {
      for (const r of list) {
        const hits = L.instances.filter(anchored(r));
        expect(hits, `${r.x},${r.y}`).toHaveLength(1);
        const inst = hits[0];
        expect(inst.kind).toBe(kind || propKind(r));
        // the frame's footprint is exactly this rect's size
        expect([shape(inst.frame).w, shape(inst.frame).h]).toEqual([r.w, r.h]);
        expect(inst.flip).toBe(r.x + r.w / 2 > WORLD_W / 2);
      }
    }
    expect(() => propsLayout('galleon')).toThrow(/only docks/);
  });

  it('shares frames between mirrored rects: 3 wall sizes × 2 variants, one per barrel/crate/kelp size', () => {
    const walls = L.shapes.filter((s) => s.kind === 'wall');
    expect(walls).toHaveLength(6);
    expect(new Set(walls.map((s) => `${s.w}x${s.h}`)).size).toBe(3);
    expect(new Set(L.shapes.map((s) => s.frame)).size).toBe(L.shapes.length);
    for (const s of L.shapes) expect(L.instances.some((i) => i.frame === s.frame)).toBe(true);
  });

  it('sizes frames to the footprint + foreshortened height and puts the anchor `pad` above the bottom', () => {
    const s = shapeFor('t', 'wall', 160, 60, 1, 1.5);
    expect(s.fw).toBe(Math.ceil((160 + 2 * s.pad) * 1.5));
    expect(s.fh).toBe(Math.ceil((60 + s.tall * Math.cos((35 * Math.PI) / 180) + 2 * s.pad) * 1.5));
    expect(s.ox).toBe(0.5);
    expect(s.fh * (1 - s.oy)).toBeCloseTo(s.pad * 1.5, 6);
    for (const sh of L.shapes) {
      expect(L.instances.filter((i) => i.frame === sh.frame).every((i) => i.ox === sh.ox && i.oy === sh.oy)).toBe(true);
    }
  });

  it('fits the atlas budget (≤ 1024²) at PROP_PX', () => {
    expect(L.px).toBe(PROP_PX);
    const lay = layoutShelves(L.shapes.map((s) => ({ id: s.frame, w: s.fw, h: s.fh })), { maxW: 1024, maxH: 1024 });
    expect(lay.w).toBeLessThanOrEqual(1024);
    expect(lay.h).toBeLessThanOrEqual(1024);
  });

  it('footprintError measures the worst edge against the rect', () => {
    expect(footprintError({ w: 60, h: 40 }, [-30, 30, 0, 40])).toBe(0);
    expect(footprintError({ w: 60, h: 40 }, [-28, 31, 2.5, 36])).toBe(4);
    expect(footprintError({ w: 60, h: 40 }, null)).toBe(Infinity);
    expect(FOOT_TOL).toBe(6);
  });

  it('clippedEdges counts opaque pixels on the top row and the side columns only', () => {
    const w = 4;
    const h = 3;
    const data = Buffer.alloc(w * h * 4);
    const set = (x: number, y: number) => (data[(y * w + x) * 4 + 3] = 255);
    set(1, 1);
    set(2, 2); // the bottom row is the anchor side: allowed
    expect(clippedEdges({ w, h, data })).toBe(0);
    set(0, 1);
    set(2, 0);
    expect(clippedEdges({ w, h, data })).toBe(2);
  });
});

describe('props atlas JSON (T43)', () => {
  const json = JSON.parse(readFileSync('client/public/art/arena/docks-props.json', 'utf8'));

  it('carries the instance list, px and a pivot per frame that match the layout', () => {
    expect(json.px).toBe(L.px);
    expect(json.props).toEqual(L.instances);
    expect(Object.keys(json.frames).sort()).toEqual(L.shapes.map((s) => s.frame).sort());
    for (const s of L.shapes) {
      const f = json.frames[s.frame];
      expect(f.pivot).toEqual({ x: s.ox, y: s.oy });
      expect([f.frame.w, f.frame.h]).toEqual([s.fw, s.fh]);
    }
  });

  it('is served next to the ground', () => {
    expect(propsKey('docks')).toBe('props-docks');
    expect(propsUrl('docks', 'json')).toBe('/art/arena/docks-props.json');
  });
});

describe('prop depth (T43)', () => {
  const wall = DOCKS_ARENA.obstacles[0];
  const inst = L.instances.find(anchored(wall))!;

  it('y-sorts walls and barrels with the fighters: behind a wall = under it, in front = over it', () => {
    const behind = sortDepth(wall.y - 30); // feet north of the wall
    const front = sortDepth(wall.y + wall.h + 30); // feet south of it
    expect(behind).toBeLessThan(propDepth(inst));
    expect(front).toBeGreaterThan(propDepth(inst));
    expect(sortDepth(0)).toBe(20);
    expect(sortDepth(WORLD_H)).toBe(21);
  });

  it('keeps kelp above every fighter', () => {
    const k = L.instances.find((i) => i.kind === 'kelp')!;
    expect(propDepth(k)).toBe(KELP_DEPTH);
    expect(KELP_DEPTH).toBeGreaterThan(sortDepth(WORLD_H));
  });
});
