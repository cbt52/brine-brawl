/**
 * Lagoon water tile (T44): `npm run art:arena -- docks --water`.
 * One Blender call (`render_water.py`) renders a 512² grey caustics mask that wraps exactly (4D
 * torus noise); the exact 2×2 box filter takes it to 256² without touching the wrap, and the mask
 * becomes the alpha of a flat pale-aqua tile: `client/public/art/arena/<id>-water.png` (palette
 * PNG, ≤ 60 KB). The client scrolls it as a TileSprite over the lagoon and the flooded pools.
 * Proves the wrap with a second render two tiles wide (both halves must match) and writes a 2×2
 * preview on lagoon blue to `.loop/shots/<id>-water.png`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { downsample2x, readRGBA } from './frames3d.mjs';
import { tileRepeat } from './seamless.mjs';

const SCRIPT = 'scripts/blender/render_water.py';
const TIMEOUT_MS = 4 * 60 * 1000;
export const WATER_SIZE = 256;
export const WATER_MAX_BYTES = 60 * 1024;
/** caustic line colour (muted, §2.11: saturation well under 45 %) */
export const WATER_TINT = [0xe2, 0xf1, 0xef];
const PREVIEW_BG = { r: 0x55, g: 0x7e, b: 0x87 };

function render(blender, png, engine, span = 1) {
  const r = spawnSync(blender, ['-b', '--factory-startup', '--python', SCRIPT, '--',
    '--out', png, '--size', String(WATER_SIZE * 2), '--engine', engine, '--span', String(span)], { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const line = out.split('\n').find((l) => l.startsWith('[water] result '));
  if (r.status === 0 && line) return JSON.parse(line.slice('[water] result '.length));
  console.warn(`art-arena: water blender failed (${engine}, status ${r.status ?? r.signal})\n${out.split('\n').filter(Boolean).slice(-12).join('\n')}`);
  return null;
}

/** Grey mask (RGBA, opaque) → flat tint with the grey as alpha. */
export function maskToTile({ w, h, data }, tint = WATER_TINT) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = tint[0];
    out[i * 4 + 1] = tint[1];
    out[i * 4 + 2] = tint[2];
    out[i * 4 + 3] = data[i * 4];
  }
  return { w, h, data: out };
}

/**
 * Mean |difference| (0..255, channel 0) between a 2×2-tile render's left and right halves and
 * between its top and bottom halves: ≈ 0 when the pattern really repeats at the tile edges.
 * (Neighbour-step seam scores misfire on thin caustic lines, so the wrap is proven directly.)
 */
export function wrapDiff({ w, h, data }) {
  const hw = w >> 1;
  const hh = h >> 1;
  const p = (x, y) => data[(y * w + x) * 4];
  let dx = 0;
  let dy = 0;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      dx += Math.abs(p(x, y) - p(x + hw, y));
      dy += Math.abs(p(x, y) - p(x, y + hh));
    }
  }
  return { x: dx / (hw * hh), y: dy / (hw * hh) };
}

/** Max mean wrap difference that still counts as seamless (render noise only). */
export const WRAP_TOL = 1;

export async function renderWater(blender, id, { tmp, outDir, engine }) {
  mkdirSync(tmp, { recursive: true });
  const raw = join(tmp, `${id}-water-mask.png`);
  const res = render(blender, raw, engine);
  if (!res) return false;
  console.log(`art-arena: ${id} water rendered with ${res.engine} (Blender ${res.blender}, ${res.sec}s)`);
  const mask = downsample2x(await readRGBA(raw));
  const twice = join(tmp, `${id}-water-span2.png`);
  if (!render(blender, twice, engine, 2)) return false;
  const d = wrapDiff(await readRGBA(twice));
  const seamOk = d.x <= WRAP_TOL && d.y <= WRAP_TOL;
  console.log(`art-arena: water wrap check (2 tiles wide) Δx ${d.x.toFixed(2)} Δy ${d.y.toFixed(2)} ${seamOk ? '✓' : `✗ (> ${WRAP_TOL})`}`);

  const tile = maskToTile(mask);
  const file = join(outDir, `${id}-water.png`);
  await sharp(tile.data, { raw: { width: tile.w, height: tile.h, channels: 4 } })
    .png({ palette: true, colours: 24, effort: 10, compressionLevel: 9 }).toFile(file);
  const bytes = statSync(file).size;
  const sizeOk = bytes <= WATER_MAX_BYTES;
  console.log(`art-arena: ${file} ${tile.w}×${tile.h} ${(bytes / 1024).toFixed(1)} KB ${sizeOk ? '✓' : `✗ (> ${WATER_MAX_BYTES / 1024} KB)`}`);

  const rep = tileRepeat(await readRGBA(file), 2);
  mkdirSync('.loop/shots', { recursive: true });
  await sharp(rep.data, { raw: { width: rep.w, height: rep.h, channels: 4 } })
    .flatten({ background: PREVIEW_BG }).png().toFile(`.loop/shots/${id}-water.png`);
  return seamOk && sizeOk;
}
