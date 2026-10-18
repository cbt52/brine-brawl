import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { frameNames } from '../../scripts/lib/spec3d.mjs';

// §2.11 performance budget for the rendered fighter atlases in client/public/art/sprites/.
const DIR = 'client/public/art/sprites';
const FEET_Y = 112;

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}
interface Atlas {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number } };
}

const ids = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
const atlas = (id: string): Atlas => JSON.parse(readFileSync(`${DIR}/${id}.json`, 'utf8'));
const spec = (id: string) => JSON.parse(readFileSync(`scripts/blender/specs/${id}.json`, 'utf8'));

describe('fighter atlases (art budget)', () => {
  it('voltbun has an atlas', () => {
    expect(ids).toContain('voltbun');
  });

  it.each(ids)('%s: ≤ 1024², ≤ 350 KB, and the PNG matches the JSON size', (id) => {
    const a = atlas(id);
    expect(a.meta.image).toBe(`${id}.png`);
    expect(a.meta.size.w).toBeLessThanOrEqual(1024);
    expect(a.meta.size.h).toBeLessThanOrEqual(1024);
    const png = readFileSync(`${DIR}/${id}.png`);
    expect(statSync(`${DIR}/${id}.png`).size).toBeLessThanOrEqual(350 * 1024);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([a.meta.size.w, a.meta.size.h]);
  });

  it.each(ids)('%s: every <anim>_<dir>_<i> frame is present and inside the atlas', (id) => {
    const a = atlas(id);
    const want = frameNames(spec(id).dirs);
    expect(want).toHaveLength(spec(id).dirs === 8 ? 112 : 70);
    expect(Object.keys(a.frames).sort()).toEqual([...want].sort());
    for (const f of Object.values(a.frames)) {
      expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(a.meta.size.w);
      expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(a.meta.size.h);
      expect(f.sourceSize).toEqual({ w: 128, h: 128 });
      expect([f.spriteSourceSize.w, f.spriteSourceSize.h]).toEqual([f.frame.w, f.frame.h]);
    }
  });

  it.each(ids)('%s: the feet stay on the y = 112 line (±3) in every frame', (id) => {
    for (const [name, f] of Object.entries(atlas(id).frames)) {
      const bottom = f.spriteSourceSize.y + f.spriteSourceSize.h - 1;
      expect(Math.abs(bottom - FEET_Y), `${name} bottom ${bottom}`).toBeLessThanOrEqual(3);
      expect(f.spriteSourceSize.y, `${name} touches the cell top`).toBeGreaterThan(0);
    }
  });
});

describe('arena ground (art budget)', () => {
  const JPG = 'client/public/art/arena/docks-ground.jpg';

  it('docks-ground.jpg is 1800×1200 (0.75× the world), ≤ 450 KB, and muted (p95 saturation ≤ 45 %)', async () => {
    const { default: sharp } = await import('sharp');
    const { saturationStats } = await import('../../scripts/lib/ground-stats.mjs');
    expect(statSync(JPG).size).toBeLessThanOrEqual(450 * 1024);
    const { data, info } = await sharp(JPG).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1800, 1200]);
    const st = saturationStats({ data, channels: info.channels });
    expect(st.p95).toBeLessThanOrEqual(0.45);
    expect(st.black).toBe(0);
  });
});

describe('arena props (art budget)', () => {
  const PNG = 'client/public/art/arena/docks-props.png';

  it('docks-props.png is ≤ 1024², ≤ 300 KB, matches its JSON and stays muted (p95 saturation ≤ 45 %)', async () => {
    const { default: sharp } = await import('sharp');
    const { saturationStats } = await import('../../scripts/lib/ground-stats.mjs');
    const json = JSON.parse(readFileSync('client/public/art/arena/docks-props.json', 'utf8'));
    expect(statSync(PNG).size).toBeLessThanOrEqual(300 * 1024);
    const { data, info } = await sharp(PNG).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([json.meta.size.w, json.meta.size.h]);
    expect(info.width).toBeLessThanOrEqual(1024);
    expect(info.height).toBeLessThanOrEqual(1024);
    // only the opaque pixels count: the transparent margins are black RGB
    const opaque: number[] = [];
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) opaque.push(data[i], data[i + 1], data[i + 2]);
    const st = saturationStats({ data: Buffer.from(opaque), channels: 3 });
    expect(st.p95).toBeLessThanOrEqual(0.45);
    expect(st.black).toBe(0);
  });
});

describe('water tile (art budget)', () => {
  const PNG = 'client/public/art/arena/docks-water.png';

  it('docks-water.png is 256², ≤ 60 KB, see-through and muted', async () => {
    const { default: sharp } = await import('sharp');
    const { saturationStats } = await import('../../scripts/lib/ground-stats.mjs');
    expect(statSync(PNG).size).toBeLessThanOrEqual(60 * 1024);
    const { data, info } = await sharp(PNG).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([256, 256]);
    // mostly clear water: the caustic lines are a minority of the pixels, the rest shows the ground
    let clear = 0;
    const lines: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) clear++;
      else lines.push(data[i], data[i + 1], data[i + 2]);
    }
    expect(clear / (data.length / 4)).toBeGreaterThan(0.6);
    const st = saturationStats({ data: Buffer.from(lines), channels: 3 });
    expect(st.p95).toBeLessThanOrEqual(0.45);
    expect(st.black).toBe(0);
  });
});
