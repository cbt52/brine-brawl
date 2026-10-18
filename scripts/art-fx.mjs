/**
 * FX atlas (T45, TASKS-LOOP §2.11): `npm run art:fx [-- --engine eevee|workbench]`.
 * One Blender call (`scripts/blender/render_props.py`, models in `scripts/blender/lib/loot.py`)
 * renders loot (chest, doubloon, heal/ult pickups) and the pilot projectiles (volt bolt, bubble,
 * water drop, taffy fist) at 2×, downsamples, checks nothing is clipped and packs
 * `client/public/art/fx/fx.{png,json}` (indexed PNG, ≤ 512², ≤ 150 KB). Every frame's origin is
 * its centre; the JSON carries `px` (atlas px per world unit). Preview: `.loop/shots/fx.png`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { findBlender } from './lib/blender.mjs';
import { downsample2x, readRGBA } from './lib/frames3d.mjs';
import { packAtlas } from './lib/pack.mjs';
import { clippedEdges } from './lib/arena-props.mjs';

const SCRIPT = 'scripts/blender/render_props.py';
const TMP = '.loop/tmp/art3d/fx';
const OUT = 'client/public/art/fx';
const TIMEOUT_MS = 8 * 60 * 1000;
const MAX = 512;
const MAX_BYTES = 150 * 1024;
/** atlas px per world unit: sprites are drawn at 1/PX, so they stay crisp at 2× device zoom */
const PX = 2;
/** frame sizes in world units (projectiles point +x) */
const FRAMES = [
  ['chest', 62, 54], ['coin', 30, 30], ['heal', 30, 30], ['ult', 44, 44],
  ['bolt', 64, 44], ['bubble', 30, 30], ['drop', 34, 24], ['fist', 38, 34],
].map(([name, w, h]) => ({ name, fw: w * PX, fh: h * PX }));

function fail(msg) {
  console.error(`art-fx: ${msg}`);
  process.exit(1);
}

function render(blender, layoutPath, outDir, engine, gpuMetal) {
  const pre = gpuMetal ? ['--gpu-backend', 'metal'] : [];
  const r = spawnSync(blender, [...pre, '-b', '--factory-startup', '--python', SCRIPT, '--',
    '--layout', layoutPath, '--out', outDir, '--engine', engine], { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const line = out.split('\n').find((l) => l.startsWith('[fx] result '));
  if (r.status === 0 && line) return JSON.parse(line.slice('[fx] result '.length));
  console.warn(`art-fx: blender failed (${engine}${gpuMetal ? ', metal' : ''}, status ${r.status ?? r.signal})\n${out.split('\n').filter(Boolean).slice(-12).join('\n')}`);
  return null;
}

const argv = process.argv.slice(2);
const ei = argv.indexOf('--engine');
const engine = ei >= 0 ? argv[ei + 1] : 'eevee';
const blender = findBlender(fail);
const frameDir = join(TMP, 'frames');
mkdirSync(frameDir, { recursive: true });
mkdirSync(OUT, { recursive: true });
const layoutPath = join(TMP, 'fx-layout.json');
writeFileSync(layoutPath, JSON.stringify({ px: PX, frames: FRAMES }, null, 1));
const res = engine === 'workbench'
  ? render(blender, layoutPath, frameDir, 'workbench', false)
  : render(blender, layoutPath, frameDir, 'eevee', false) ?? render(blender, layoutPath, frameDir, 'eevee', true);
if (!res) fail('render failed');
console.log(`art-fx: ${res.frames.length} frames with ${res.engine} (Blender ${res.blender}, ${res.sec}s)`);

let ok = true;
const frames = [];
for (const f of FRAMES) {
  const img = downsample2x(await readRGBA(join(frameDir, `${f.name}.png`)));
  const clip = clippedEdges(img);
  let opaque = 0;
  for (let i = 3; i < img.data.length; i += 4) opaque += img.data[i] > 8 ? 1 : 0;
  const good = img.w === f.fw && img.h === f.fh && clip === 0 && opaque > 0;
  ok &&= good;
  console.log(`art-fx:   ${f.name} ${img.w}×${img.h} opaque ${opaque} px, clipped ${clip} px ${good ? '✓' : '✗'}`);
  frames.push({ name: f.name, ...img });
}

const png = join(OUT, 'fx.png');
const jsonPath = join(OUT, 'fx.json');
const lay = await packAtlas(frames, png, jsonPath, { palette: true, maxW: MAX, maxH: MAX });
const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
json.meta.app = 'brine-brawl art-fx';
json.px = PX;
writeFileSync(jsonPath, JSON.stringify(json, null, 1) + '\n');
const bytes = statSync(png).size;
const fits = bytes <= MAX_BYTES && lay.w <= MAX && lay.h <= MAX;
ok &&= fits;
console.log(`art-fx: ${png} ${lay.w}×${lay.h} ${(bytes / 1024).toFixed(1)} KB ${fits ? '✓' : `✗ (≤ ${MAX}², ≤ ${MAX_BYTES / 1024} KB)`}`);

// preview: the atlas on sand, plus every frame at in-game size (1/PX) ×2 device zoom
mkdirSync('.loop/shots', { recursive: true });
await sharp(png).flatten({ background: '#D9C89F' }).toFile('.loop/shots/fx.png');
console.log('art-fx: preview .loop/shots/fx.png');
if (!ok) process.exit(1);
