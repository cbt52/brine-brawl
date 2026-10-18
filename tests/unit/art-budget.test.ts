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

  it.each(ids)('%s: the figure stays within the 120 px width and cell top, and reads ≥ 90 px in idle', (id) => {
    const frames = Object.entries(atlas(id).frames);
    for (const [name, f] of frames) {
      expect(f.spriteSourceSize.w, `${name} width`).toBeLessThanOrEqual(120);
      expect(f.spriteSourceSize.y, `${name} touches the cell top`).toBeGreaterThan(0);
      expect(f.spriteSourceSize.h, `${name} overflows the cell`).toBeLessThanOrEqual(120);
    }
    const minH = spec(id).anim?.style === 'blob' ? 75 : 90; // a blob squash (sudsy) reads shorter than a biped
    for (const [name, f] of frames) {
      if (!name.startsWith('idle_')) continue;
      expect(f.spriteSourceSize.h, `${name} figure too small`).toBeGreaterThanOrEqual(minH);
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

describe('fx atlas (art budget)', () => {
  const PNG = 'client/public/art/fx/fx.png';

  it('fx.png is ≤ 512², ≤ 150 KB and matches its JSON', async () => {
    const { default: sharp } = await import('sharp');
    const json = JSON.parse(readFileSync('client/public/art/fx/fx.json', 'utf8'));
    expect(statSync(PNG).size).toBeLessThanOrEqual(150 * 1024);
    const meta = await sharp(PNG).metadata();
    expect([meta.width, meta.height]).toEqual([json.meta.size.w, json.meta.size.h]);
    expect(meta.width).toBeLessThanOrEqual(512);
    expect(meta.height).toBeLessThanOrEqual(512);
    for (const [name, f] of Object.entries<{ frame: { x: number; y: number; w: number; h: number } }>(json.frames)) {
      expect(f.frame.x + f.frame.w, name).toBeLessThanOrEqual(json.meta.size.w);
      expect(f.frame.y + f.frame.h, name).toBeLessThanOrEqual(json.meta.size.h);
    }
  });
});

describe('pilot download + GPU memory (§2.11 budgets)', () => {
  const S = 'client/public/art/sprites';
  const loaded = () => {
    const files = [
      ...ids.flatMap((id) => [`${S}/${id}.png`, `${S}/${id}.json`]),
      'client/public/art/arena/docks-ground.jpg',
      'client/public/art/arena/docks-props.png',
      'client/public/art/arena/docks-props.json',
      'client/public/art/arena/docks-water.png',
      'client/public/art/fx/fx.png',
      'client/public/art/fx/fx.json',
    ];
    return files;
  };

  it('the pilot extra download (all 4 sheets + arena + fx) stays ≤ 2.5 MB', () => {
    const files = loaded();
    for (const f of files) expect(existsSync(f), `missing ${f}`).toBe(true);
    const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
    expect(bytes / 1024).toBeLessThanOrEqual(2.5 * 1024);
    // the number is recorded in .loop/perf.md by `npm run perf`
    expect(bytes).toBeGreaterThan(0);
  });

  it('GPU memory of a loaded match (RGBA) stays ≈ 50 MB', async () => {
    const { default: sharp } = await import('sharp');
    let bytes = 0;
    for (const f of loaded()) {
      if (!/\.(png|jpg)$/.test(f)) continue;
      const meta = await sharp(f).metadata();
      bytes += (meta.width ?? 0) * (meta.height ?? 0) * 4;
    }
    expect(bytes / 1024 / 1024).toBeLessThanOrEqual(50);
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
