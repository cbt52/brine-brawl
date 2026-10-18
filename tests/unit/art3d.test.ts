import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { layoutShelves } from '../../scripts/lib/pack.mjs';
import { ANIM_AMPS, ANIMS, frameNames, specColours, validateSpec } from '../../scripts/lib/spec3d.mjs';
import { trimFrame } from '../../scripts/lib/frames3d.mjs';
import { encodeIndexedPng, quantize } from '../../scripts/lib/indexed-png.mjs';
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
    s.parts[2].prims[0].type = 'pyramid';
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
    s.face.teeth = 'buck';
    const errs = validateSpec(s).join('\n');
    expect(errs).toMatch(/face\.teeth/);
    expect(errs).toMatch(/parts\[1\]\.pivot/);
    expect(errs).toMatch(/features\[0\]\.fn/);
    expect(errs).toMatch(/features\[1\]\.band/);
    expect(errs).toMatch(/features\[2\] adds part "tail"/);
    expect(errs).toMatch(/face\.part/);
  });

  it('accepts torus rings with waves and rejects a tube as wide as the ring', () => {
    const s = selftest();
    s.parts[0].prims.push({ type: 'torus', at: [0, 0, 10], size: [40, 40, 6], waves: [7, 1.5, 1] });
    s.parts[0].prims.push({ type: 'torus', at: [0, 0, 20], size: [40, 40, 6], waves: [3, -4, 6, 90] });
    expect(validateSpec(s)).toEqual([]);
    s.parts[0].prims.push({ type: 'torus', at: [0, 0, 10], size: [10, 10, 12], waves: [1.5, 'x'] });
    const errs = validateSpec(s).join('\n');
    expect(errs).toMatch(/tube/);
    expect(errs).toMatch(/waves/);
  });
});

describe('fighter specs', () => {
  const ids = ['voltbun', 'mira', 'noodle', 'sudsy'];
  const spec = (id: string) => JSON.parse(readFileSync(`scripts/blender/specs/${id}.json`, 'utf8'));

  it.each(ids)('%s is valid', (id) => {
    expect(validateSpec(spec(id))).toEqual([]);
  });

  it.each(ids)('%s pal equals the art-models pal', (id) => {
    const model = MODELS.find((m) => m.id === id);
    expect(model).toBeDefined();
    expect(spec(id).pal).toEqual(model!.pal);
  });

  it.each(ids)('%s paints every palette colour (the faction accent included)', (id) => {
    const keys = specColours(spec(id)).map(([k]) => k);
    for (const k of ['body', 'detail', 'prop', 'trim']) expect(keys).toContain(k);
  });
});

describe('puppet anims', () => {
  it('lists 14 frames per direction: idle 4, run 6, attack 3, hurt 1', () => {
    expect(ANIMS).toEqual([['idle', 4], ['run', 6], ['attack', 3], ['hurt', 1]]);
    const names = frameNames(5);
    expect(names).toHaveLength(70);
    expect(new Set(names).size).toBe(70);
    expect(names.slice(0, 14)).toEqual([
      'idle_S_0', 'idle_S_1', 'idle_S_2', 'idle_S_3', 'run_S_0', 'run_S_1', 'run_S_2', 'run_S_3', 'run_S_4', 'run_S_5',
      'attack_S_0', 'attack_S_1', 'attack_S_2', 'hurt_S_0',
    ]);
    expect(frameNames(8)).toHaveLength(112);
  });

  it('mirrors the amplitude keys of puppet.py and validates anim overrides', () => {
    const py = readFileSync('scripts/blender/lib/puppet.py', 'utf8');
    const biped = py.slice(py.indexOf("'biped': {"), py.indexOf("'blob': {"));
    expect([...biped.matchAll(/'(\w+)':/g)].map((m) => m[1]).slice(1).sort()).toEqual([...ANIM_AMPS].sort());
    const s = JSON.parse(readFileSync('scripts/blender/specs/voltbun.json', 'utf8'));
    expect(validateSpec({ ...s, anim: { style: 'blob', amp: { hop: 2 }, roles: { armR: 'claw' }, attackArm: 'both' } })).toEqual([]);
    const bad = { style: 'biped', amp: { wiggle: 1, bob: 'x' }, roles: { wing: 'w' }, attackArm: 'tail' };
    const errs = validateSpec({ ...s, anim: bad }).join('\n');
    expect(errs).toMatch(/anim\.amp\.wiggle/);
    expect(errs).toMatch(/anim\.amp\.bob/);
    expect(errs).toMatch(/anim\.roles\.wing/);
    expect(errs).toMatch(/attackArm/);
  });
});

describe('trimFrame', () => {
  it('crops to the alpha box and records the offset in the source cell', () => {
    const w = 8;
    const h = 6;
    const data = Buffer.alloc(w * h * 4);
    for (const [x, y] of [[2, 1], [5, 4]]) data[(y * w + x) * 4 + 3] = 255;
    const t = trimFrame({ w, h, data });
    expect([t.w, t.h, t.src]).toEqual([4, 4, { x: 2, y: 1, sw: 8, sh: 6 }]);
    expect(t.data[3]).toBe(255);
    expect(t.data[(3 * 4 + 3) * 4 + 3]).toBe(255);
  });
});

describe('indexed PNG', () => {
  it('keeps the requested hexes exact under palette pressure and round-trips through a decoder', async () => {
    const w = 64;
    const h = 64;
    const data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      // thousands of distinct colours, one pixel of the "keep" colour, some transparent pixels
      data[i * 4] = (i * 7) & 255;
      data[i * 4 + 1] = (i * 13) & 255;
      data[i * 4 + 2] = i & 255;
      data[i * 4 + 3] = i % 97 === 0 ? 0 : i % 5 === 0 ? 128 : 255;
    }
    data.set([0xe4, 0xd3, 0xb0, 255], 301 * 4);
    const q = quantize(data, { keep: ['#E4D3B0'] });
    expect(q.palette.length).toBeLessThanOrEqual(256);
    const png = encodeIndexedPng(w, h, q);
    expect(png[25]).toBe(3);
    const sharp = (await import('sharp')).default;
    const { data: out } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...out.subarray(301 * 4, 301 * 4 + 4)]).toEqual([0xe4, 0xd3, 0xb0, 255]);
    expect(out[97 * 4 + 3]).toBe(0);
    expect(out.length).toBe(w * h * 4);
  });

  it('is lossless when the image has ≤ 256 colours', () => {
    const px = [10, 20, 30, 255, 0, 0, 0, 0, 10, 20, 30, 255, 200, 100, 50, 64];
    const q = quantize(Buffer.from(px));
    expect([...q.index].flatMap((i) => q.palette[i])).toEqual(px);
  });
});
