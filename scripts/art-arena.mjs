/**
 * Arena ground + props + water render (T42/T43/T44, TASKS-LOOP §2.11 "Arena"):
 *   npm run art:arena -- docks [--ground] [--props] [--water] [--engine eevee|workbench]
 * All parts by default; the flags pick only those parts (EEVEE output isn't byte-stable, so
 * re-rendering an untouched part just makes git churn). Props: see `scripts/lib/arena-props.mjs`,
 * water tile: `scripts/lib/arena-water.mjs`.
 * Exports the layout from `shared/arena/` (via tsx, see `scripts/lib/arena-layout.ts`), renders it
 * top-down with one headless Blender call (`scripts/blender/render_arena.py`) and encodes
 * `client/public/art/arena/<id>-ground.jpg` (1800×1200, ≤ 450 KB, quality stepped down to fit).
 * Checks the §2.11 saturation rule (p95 ≤ 45 %) and that no pixel is pure black.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { arenaLayout } from './lib/arena-layout.ts';
import { findBlender } from './lib/blender.mjs';
import { saturationStats } from './lib/ground-stats.mjs';
import { renderProps } from './lib/arena-props.mjs';
import { renderWater } from './lib/arena-water.mjs';

const SCRIPT = 'scripts/blender/render_arena.py';
const TMP = '.loop/tmp/art3d/arena';
const OUT = 'client/public/art/arena';
const TIMEOUT_MS = 8 * 60 * 1000;
const MAX_BYTES = 450 * 1024;
const MAX_SAT = 0.45;

function fail(msg) {
  console.error(`art-arena: ${msg}`);
  process.exit(1);
}

function render(blender, layoutPath, png, engine, gpuMetal) {
  const pre = gpuMetal ? ['--gpu-backend', 'metal'] : [];
  const r = spawnSync(blender, [...pre, '-b', '--factory-startup', '--python', SCRIPT, '--',
    '--layout', layoutPath, '--out', png, '--engine', engine], { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const line = out.split('\n').find((l) => l.startsWith('[arena] result '));
  if (r.status === 0 && line) return JSON.parse(line.slice('[arena] result '.length));
  console.warn(`art-arena: blender failed (${engine}${gpuMetal ? ', metal' : ''}, status ${r.status ?? r.signal})\n${out.split('\n').filter(Boolean).slice(-12).join('\n')}`);
  return null;
}

const argv = process.argv.slice(2);
const ei = argv.indexOf('--engine');
const engine = ei >= 0 ? argv[ei + 1] : 'eevee';
const ids = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--engine');
if (!ids.length) fail('usage: art-arena <id…> [--ground] [--props] [--water] [--engine eevee|workbench]');
const PARTS = ['ground', 'props', 'water'];
const picked = PARTS.filter((p) => argv.includes(`--${p}`));
const want = new Set(picked.length ? picked : PARTS);
const blender = findBlender(fail);
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
let ok = true;
for (const id of ids) {
  if (want.has('props')) ok = (await renderProps(blender, id, { tmp: TMP, outDir: OUT, engine })) && ok;
  if (want.has('water')) ok = (await renderWater(blender, id, { tmp: TMP, outDir: OUT, engine })) && ok;
  if (!want.has('ground')) continue;
  let layout;
  try {
    layout = arenaLayout(id);
  } catch (e) {
    fail(e.message);
  }
  const layoutPath = join(TMP, `${id}-layout.json`);
  writeFileSync(layoutPath, JSON.stringify(layout, null, 1));
  const png = join(TMP, `${id}-ground.png`);
  const res = engine === 'workbench'
    ? render(blender, layoutPath, png, 'workbench', false)
    : render(blender, layoutPath, png, 'eevee', false) ?? render(blender, layoutPath, png, 'eevee', true);
  if (!res) fail(`${id}: render failed`);
  console.log(`art-arena: ${id} rendered ${res.objects} objects with ${res.engine} (Blender ${res.blender}, ${res.sec}s)`);

  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== layout.out.w || info.height !== layout.out.h) {
    ok = false;
    console.log(`art-arena: ✗ size ${info.width}×${info.height}, want ${layout.out.w}×${layout.out.h}`);
  }
  const st = saturationStats({ data, channels: info.channels });
  const satOk = st.p95 <= MAX_SAT && st.black === 0;
  ok &&= satOk;
  console.log(`art-arena: saturation mean ${(st.mean * 100).toFixed(1)} % · p95 ${(st.p95 * 100).toFixed(0)} % · max ${(st.max * 100).toFixed(0)} % · pure black ${st.black} px ${satOk ? '✓' : `✗ (p95 ≤ ${MAX_SAT * 100} %, no black)`}`);

  const jpg = join(OUT, `${id}-ground.jpg`);
  let q = 88;
  for (; ; q -= 4) {
    await sharp(png).jpeg({ quality: q, mozjpeg: true }).toFile(jpg);
    if (statSync(jpg).size <= MAX_BYTES || q <= 60) break;
  }
  const bytes = statSync(jpg).size;
  ok &&= bytes <= MAX_BYTES;
  console.log(`art-arena: ${jpg} ${info.width}×${info.height} q${q} ${(bytes / 1024).toFixed(1)} KB ${bytes <= MAX_BYTES ? '✓' : `✗ (> ${MAX_BYTES / 1024} KB)`}`);
}
if (!ok) process.exit(1);
