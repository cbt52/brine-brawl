/**
 * 3D sprite orchestrator (TASKS-LOOP §2.11):
 *   npm run art:3d -- <id…> [--still] [--contact] [--shot <name>] [--out <dir>] [--atlas <dir>] [--engine eevee|workbench]
 * One headless Blender call per id renders `scripts/blender/specs/<id>.json` to 2× frames in
 * `<out>/<id>/`; this script downsamples them to 1×, trims them, packs `<atlas>/<id>.{png,json}`
 * and checks it: palette hex exact, frame names, ≤ 1024² and ≤ 350 KB, feet line 112 ± 3.
 * The full render (70 frames) goes to `client/public/art/sprites/` as an indexed PNG; --still
 * (idle_<dir>_0 + hurt_S_0) stays in `<out>`. --contact writes `.loop/shots/<shot|id>-contact.png`.
 * EEVEE fallbacks: retry once with `--gpu-backend metal`, then Workbench (flat + outline).
 */
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { frameNames, specColours, validateSpec } from './lib/spec3d.mjs';
import { packAtlas } from './lib/pack.mjs';
import { alphaBox, contactSheet, downsample2x, paletteHits, pixelHex, readRGBA, trimFrame } from './lib/frames3d.mjs';

const SPECS = 'scripts/blender/specs';
const SCRIPT = 'scripts/blender/render_fighter.py';
const MAC_APP = '/Applications/Blender.app/Contents/MacOS/Blender';
const TIMEOUT_MS = 8 * 60 * 1000;
const FEET_Y = 112;
const SPRITES = 'client/public/art/sprites';
const ATLAS_MAX = 1024;
const ATLAS_BYTES = 350 * 1024;

function parseArgs(argv) {
  const o = { ids: [], still: false, contact: false, shot: null, out: '.loop/tmp/art3d', atlas: null, engine: 'eevee' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--still') o.still = true;
    else if (a === '--contact') o.contact = true;
    else if (a === '--shot') o.shot = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--atlas') o.atlas = argv[++i];
    else if (a === '--engine') o.engine = argv[++i];
    else if (a.startsWith('--')) fail(`unknown flag ${a}`);
    else o.ids.push(a);
  }
  if (!o.ids.length) fail('usage: art3d <id…> [--still] [--contact] [--shot <name>] [--out <dir>]');
  return o;
}

function fail(msg) {
  console.error(`art3d: ${msg}`);
  process.exit(1);
}

function isExe(p) {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findBlender() {
  if (process.env.BLENDER) {
    if (isExe(process.env.BLENDER)) return process.env.BLENDER;
    fail(`BLENDER=${process.env.BLENDER} is not an executable`);
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && isExe(join(dir, 'blender'))) return join(dir, 'blender');
  }
  if (isExe(MAC_APP)) return MAC_APP;
  fail('Blender not found. Install Blender 4.2+ and put `blender` on PATH, or set BLENDER=/path/to/blender.');
}

function runBlender(blender, specPath, frameDir, engine, gpuMetal, still) {
  const pre = gpuMetal ? ['--gpu-backend', 'metal'] : [];
  const args = [...pre, '-b', '--factory-startup', '--python', SCRIPT, '--',
    '--spec', specPath, '--out', frameDir, '--engine', engine, ...(still ? ['--still'] : [])];
  const r = spawnSync(blender, args, { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const line = out.split('\n').find((l) => l.startsWith('[art3d] result '));
  if (r.status === 0 && line) return JSON.parse(line.slice('[art3d] result '.length));
  const tail = out.split('\n').filter(Boolean).slice(-12).join('\n');
  console.warn(`art3d: blender failed (${engine}${gpuMetal ? ', metal' : ''}, status ${r.status ?? r.signal})\n${tail}`);
  return null;
}

function render(blender, specPath, frameDir, engine, still) {
  if (engine === 'workbench') return runBlender(blender, specPath, frameDir, 'workbench', false, still);
  return runBlender(blender, specPath, frameDir, 'eevee', false, still)
    ?? runBlender(blender, specPath, frameDir, 'eevee', true, still)
    ?? (console.warn('art3d: EEVEE unavailable headless, falling back to Workbench (flat + outline)'),
    runBlender(blender, specPath, frameDir, 'workbench', false, still));
}

async function processId(blender, id, o) {
  const specPath = join(SPECS, `${id}.json`);
  if (!existsSync(specPath)) fail(`no spec ${specPath}`);
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const errs = validateSpec(spec);
  if (errs.length) fail(`${specPath}:\n  ${errs.join('\n  ')}`);

  const frameDir = join(o.out, id);
  mkdirSync(frameDir, { recursive: true });
  const res = render(blender, specPath, frameDir, o.engine, o.still);
  if (!res) fail(`${id}: every render path failed`);
  console.log(`art3d: ${id} rendered ${res.frames.length} frames with ${res.engine} (Blender ${res.blender}, ${res.sec}s)`);

  const frames = [];
  for (const name of res.frames) {
    const big = await readRGBA(join(frameDir, `${name}.png`));
    frames.push({ name, ...downsample2x(big) });
  }
  const atlasDir = o.atlas ?? (o.still ? o.out : SPRITES);
  mkdirSync(atlasDir, { recursive: true });
  const png = join(atlasDir, `${id}.png`);
  const trimmed = frames.map((f) => ({ name: f.name, ...trimFrame(f) }));
  const lay = await packAtlas(trimmed, png, join(atlasDir, `${id}.json`), { palette: !o.still, keep: specColours(spec).map(([, h]) => h), maxW: ATLAS_MAX, maxH: ATLAS_MAX });
  const bytes = statSync(png).size;
  let ok = bytes <= ATLAS_BYTES;
  console.log(`art3d: atlas ${join(atlasDir, id)}.{png,json} ${lay.w}×${lay.h}, ${(bytes / 1024).toFixed(1)} KB ${ok ? '✓' : `✗ (> ${ATLAS_BYTES / 1024} KB)`}`);

  if (!o.still) {
    const want = frameNames(spec.dirs);
    const missing = want.filter((n) => !res.frames.includes(n));
    if (missing.length) {
      ok = false;
      console.log(`art3d: ✗ missing frames ${missing.join(', ')}`);
    } else console.log(`art3d: all ${want.length} frame names present ✓`);
  }

  // Palette on the packed atlas, so the indexed PNG is checked too.
  const atlas = await readRGBA(png);
  const hits = paletteHits(atlas, specColours(spec).map(([, x]) => x));
  for (const [key, h] of specColours(spec)) {
    const v = hits.get(h.toUpperCase());
    if (!v?.count) {
      ok = false;
      console.log(`art3d: palette ${key} ${h} ✗ no exact pixel`);
      continue;
    }
    console.log(`art3d: palette ${key} ${h} → sampled ${pixelHex(atlas, v.at[0], v.at[1])} at atlas(${v.at}) · ${v.count} exact px ✓`);
  }

  const box = alphaBox(frames[0]);
  if (box) {
    const tall = FEET_Y - box.y;
    const flag = tall >= 96 && tall <= 104 ? '✓' : '(target 96–104)';
    console.log(`art3d: ${frames[0].name} figure ${tall} px above the feet line, bottom y=${box.y + box.h - 1}, width ${box.w} px ${flag}`);
  }
  const boxes = frames.map(alphaBox).filter(Boolean);
  if (boxes.length > 1) {
    const span = (vals) => `${Math.min(...vals)}–${Math.max(...vals)}`;
    console.log(`art3d: all frames: top y ${span(boxes.map((b) => b.y))}, bottom y ${span(boxes.map((b) => b.y + b.h - 1))}, width ${span(boxes.map((b) => b.w))} px`);
  }
  const off = trimmed.filter((f) => Math.abs(f.src.y + f.h - 1 - FEET_Y) > 3);
  if (off.length) {
    ok = false;
    console.log(`art3d: ✗ feet off the y=${FEET_Y}±3 line: ${off.map((f) => `${f.name}@${f.src.y + f.h - 1}`).join(', ')}`);
  } else console.log(`art3d: feet line ${FEET_Y}±3 in every frame ✓`);

  if (o.contact) {
    mkdirSync('.loop/shots', { recursive: true });
    const file = `.loop/shots/${o.shot ?? id}-contact.png`;
    const rows = [...new Set(frames.map((f) => f.name.split('_')[1]))].map((d) => frames.filter((f) => f.name.split('_')[1] === d));
    await contactSheet(o.still ? frames : rows, file);
    console.log(`art3d: contact sheet ${file}`);
  }
  return ok;
}

const o = parseArgs(process.argv.slice(2));
const blender = findBlender();
const t0 = Date.now();
let ok = true;
for (const id of o.ids) ok = (await processId(blender, id, o)) && ok;
console.log(`art3d: done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!ok) process.exit(1);
