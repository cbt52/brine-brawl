/**
 * Arena props atlas (T43): `npm run art:arena -- docks --props`.
 * Renders the shapes of `props-layout.ts` with one Blender call (`render_arena_props.py`),
 * downsamples the 2× frames, checks every footprint against its collision rect (±6 u) and that no
 * frame is clipped, then packs `client/public/art/arena/<id>-props.{png,json}` (indexed PNG,
 * ≤ 1024², ≤ 300 KB). The JSON carries a `pivot` per frame, `px` and the `props` instance list
 * (world anchors) for the client. Writes a preview on sand to `.loop/shots/<id>-props.png`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { FOOT_TOL, footprintError, propsLayout } from './props-layout.ts';
import { downsample2x, readRGBA } from './frames3d.mjs';
import { packAtlas } from './pack.mjs';
import { saturationStats } from './ground-stats.mjs';

const SCRIPT = 'scripts/blender/render_arena_props.py';
const TIMEOUT_MS = 8 * 60 * 1000;
const MAX = 1024;
const MAX_BYTES = 300 * 1024;

function render(blender, layoutPath, outDir, engine, gpuMetal) {
  const pre = gpuMetal ? ['--gpu-backend', 'metal'] : [];
  const r = spawnSync(blender, [...pre, '-b', '--factory-startup', '--python', SCRIPT, '--',
    '--layout', layoutPath, '--out', outDir, '--engine', engine], { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const line = out.split('\n').find((l) => l.startsWith('[props] result '));
  if (r.status === 0 && line) return JSON.parse(line.slice('[props] result '.length));
  console.warn(`art-arena: props blender failed (${engine}${gpuMetal ? ', metal' : ''}, status ${r.status ?? r.signal})\n${out.split('\n').filter(Boolean).slice(-12).join('\n')}`);
  return null;
}

/** Opaque pixels on the frame's top row or side columns = the model pokes out of its frame. */
export function clippedEdges({ w, h, data }) {
  const a = (x, y) => data[(y * w + x) * 4 + 3] > 8;
  let n = 0;
  for (let x = 0; x < w; x++) n += a(x, 0) ? 1 : 0;
  for (let y = 0; y < h; y++) n += (a(0, y) ? 1 : 0) + (a(w - 1, y) ? 1 : 0);
  return n;
}

/** Render + pack one arena's props; returns false when a check failed. */
export async function renderProps(blender, id, { tmp, outDir, engine }) {
  const L = propsLayout(id);
  const layoutPath = join(tmp, `${id}-props-layout.json`);
  const frameDir = join(tmp, `${id}-props`);
  mkdirSync(frameDir, { recursive: true });
  writeFileSync(layoutPath, JSON.stringify(L, null, 1));
  const res = engine === 'workbench'
    ? render(blender, layoutPath, frameDir, 'workbench', false)
    : render(blender, layoutPath, frameDir, 'eevee', false) ?? render(blender, layoutPath, frameDir, 'eevee', true);
  if (!res) return false;
  console.log(`art-arena: ${id} props: ${res.frames.length} frames with ${res.engine} (Blender ${res.blender}, ${res.sec}s)`);

  let ok = true;
  const frames = [];
  for (const shape of L.shapes) {
    const img = downsample2x(await readRGBA(join(frameDir, `${shape.frame}.png`)));
    const foot = res.frames.find((f) => f.name === shape.frame)?.foot ?? null;
    const err = footprintError(shape, foot);
    const clip = clippedEdges(img);
    const good = img.w === shape.fw && img.h === shape.fh && err <= FOOT_TOL && clip === 0;
    ok &&= good;
    console.log(`art-arena:   ${shape.frame} ${img.w}×${img.h} foot [${foot}] vs ${shape.w}×${shape.h} → ±${err.toFixed(1)} u, clipped ${clip} px ${good ? '✓' : '✗'}`);
    frames.push({ name: shape.frame, ...img });
  }

  const png = join(outDir, `${id}-props.png`);
  const jsonPath = join(outDir, `${id}-props.json`);
  const lay = await packAtlas(frames, png, jsonPath, { palette: true, maxW: MAX, maxH: MAX });
  const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
  for (const s of L.shapes) json.frames[s.frame].pivot = { x: s.ox, y: s.oy };
  json.meta.app = 'brine-brawl art-arena props';
  json.px = L.px;
  json.props = L.instances;
  writeFileSync(jsonPath, JSON.stringify(json, null, 1) + '\n');

  const bytes = statSync(png).size;
  const fits = bytes <= MAX_BYTES && lay.w <= MAX && lay.h <= MAX;
  ok &&= fits;
  console.log(`art-arena: ${png} ${lay.w}×${lay.h} ${(bytes / 1024).toFixed(1)} KB, ${L.instances.length} instances ${fits ? '✓' : `✗ (≤ ${MAX}², ≤ ${MAX_BYTES / 1024} KB)`}`);

  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const opaque = [];
  for (let i = 0; i < data.length; i += info.channels) if (data[i + 3] > 200) opaque.push(data[i], data[i + 1], data[i + 2]);
  const st = saturationStats({ data: Buffer.from(opaque), channels: 3 });
  console.log(`art-arena: props saturation mean ${(st.mean * 100).toFixed(1)} % · p95 ${(st.p95 * 100).toFixed(0)} % · max ${(st.max * 100).toFixed(0)} %`);

  mkdirSync('.loop/shots', { recursive: true });
  await sharp(png).flatten({ background: '#D9C89F' }).toFile(`.loop/shots/${id}-props.png`);
  console.log(`art-arena: preview .loop/shots/${id}-props.png`);
  return ok;
}
