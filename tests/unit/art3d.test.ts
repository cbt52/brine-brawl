import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { layoutShelves } from '../../scripts/lib/pack.mjs';
import { specColours, validateSpec } from '../../scripts/lib/spec3d.mjs';
import { MODELS } from '../../scripts/art-models.mjs';

const rects = (n: number, seed = 1) => {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => ({ id: `f${i}`, w: 20 + Math.floor(rnd() * 108), h: 20 + Math.floor(rnd() * 108) }));
};

describe('layoutShelves', () => {
  it('places every rect without overlap and inside the atlas', () => {
    const lay = layoutShelves(rects(70), { pad: 2 });
    expect(lay.frames).toHaveLength(70);
    for (const f of lay.frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(lay.w);
      expect(f.y + f.h).toBeLessThanOrEqual(lay.h);
    }
    for (let i = 0; i < lay.frames.length; i++) {
      for (let j = i + 1; j < lay.frames.length; j++) {
        const a = lay.frames[i];
        const b = lay.frames[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });

  it('stays within the max size and keeps input order and sizes', () => {
    const input = rects(40, 7);
    const lay = layoutShelves(input, { maxW: 1024, maxH: 1024 });
    expect(lay.w).toBeLessThanOrEqual(1024);
    expect(lay.h).toBeLessThanOrEqual(1024);
    expect(lay.frames.map((f) => [f.id, f.w, f.h])).toEqual(input.map((r) => [r.id, r.w, r.h]));
  });

  it('fits a full 70-frame fighter (14 frames × 5 dirs, trimmed to 100×110) into 1024²', () => {
    const cells = Array.from({ length: 70 }, (_, i) => ({ id: `c${i}`, w: 100, h: 110 }));
    const lay = layoutShelves(cells);
    expect(lay.w).toBeLessThanOrEqual(1024);
    expect(lay.h).toBeLessThanOrEqual(1024);
  });

  it('is deterministic', () => {
    expect(layoutShelves(rects(30, 3))).toEqual(layoutShelves(rects(30, 3)));
  });

  it('throws when the frames cannot fit', () => {
    const big = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, w: 300, h: 300 }));
    expect(() => layoutShelves(big, { maxW: 512, maxH: 512 })).toThrow(/do not fit/);
    expect(layoutShelves([])).toEqual({ w: 0, h: 0, frames: [] });
  });
});

describe('validateSpec', () => {
  const selftest = () => JSON.parse(readFileSync('scripts/blender/specs/selftest.json', 'utf8'));

  it('accepts the selftest spec', () => {
    expect(validateSpec(selftest())).toEqual([]);
  });

  it('reports bad palette, dirs, prims and parents', () => {
    const s = selftest();
    s.pal.trim = 'gold';
    s.dirs = 6;
    s.parts[1].parent = 'nope';
    s.parts[2].prims[0].type = 'torus';
    s.parts[2].prims[0].size = [1, 0, 1];
    s.anim.style = 'dance';
    const errs = validateSpec(s).join('\n');
    expect(errs).toMatch(/pal\.trim/);
    expect(errs).toMatch(/dirs/);
    expect(errs).toMatch(/parts\[1\]\.parent/);
    expect(errs).toMatch(/prims\[0\]\.type/);
    expect(errs).toMatch(/prims\[0\]\.size/);
    expect(errs).toMatch(/anim\.style/);
  });

  it('rejects duplicated part names, a missing part list and non-objects', () => {
    const s = selftest();
    s.parts[1].name = 'body';
    expect(validateSpec(s).join('\n')).toMatch(/duplicated/);
    expect(validateSpec({ ...selftest(), parts: [] }).join('\n')).toMatch(/non-empty/);
    expect(validateSpec(null)).toEqual(['spec must be an object']);
  });

  it('validates pivots, features and the face', () => {
    const s = JSON.parse(readFileSync('scripts/blender/specs/voltbun.json', 'utf8'));
    s.parts[1].pivot = [1, 2];
    s.features[0].fn = 'earsShort';
    s.features[1].band = 'teal';
    s.features.push({ fn: 'tailBattery', parent: 'body', at: [0, 0, 0] });
    s.face.part = 'hat';
    const errs = validateSpec(s).join('\n');
    expect(errs).toMatch(/parts\[1\]\.pivot/);
    expect(errs).toMatch(/features\[0\]\.fn/);
    expect(errs).toMatch(/features\[1\]\.band/);
    expect(errs).toMatch(/features\[2\] adds part "tail"/);
    expect(errs).toMatch(/face\.part/);
  });
});

describe('fighter specs', () => {
  const ids = ['voltbun'];
  const spec = (id: string) => JSON.parse(readFileSync(`scripts/blender/specs/${id}.json`, 'utf8'));

  it.each(ids)('%s is valid', (id) => {
    expect(validateSpec(spec(id))).toEqual([]);
  });

  it.each(ids)('%s pal equals the art-models pal', (id) => {
    const model = MODELS.find((m) => m.id === id);
    expect(model).toBeDefined();
    expect(spec(id).pal).toEqual(model!.pal);
  });

  it('paints every palette colour, the faction gold included', () => {
    expect(specColours(spec('voltbun')).map(([k]) => k).sort()).toEqual(['body', 'detail', 'prop', 'trim']);
  });
});
