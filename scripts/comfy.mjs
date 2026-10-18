/**
 * Ground textures via local ComfyUI (T41, optional):
 *   npm run comfy [-- <tile…>] [--keep]
 * Uses the API workflow `~/AI/ComfyUI-Shared/api/flux2-klein-t2i.json` (FLUX.2 klein 4B).
 * If ComfyUI is already running the user is using it → exit 2 (skip). Otherwise this script
 * starts the Comfy Desktop app, waits ≤ 3 min for :8188 or :8000, renders each tile at
 * 1024², box-downsamples to 512², makes it seamless (`lib/seamless.mjs`) and writes
 * `scripts/blender/textures/<tile>.jpg` (≤ 150 KB). Raw outputs go to `.loop/tmp/comfy/`, a 2×2
 * tiled contact sheet to `.loop/shots/T41-tiles.png`. Quits the app again unless --keep.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { downsample2x } from './lib/frames3d.mjs';
import { makeSeamless, seamScore, tileRepeat } from './lib/seamless.mjs';

const HOSTS = ['http://127.0.0.1:8188', 'http://127.0.0.1:8000']; // launcher script / Desktop default
let HOST = HOSTS[0];
const WORKFLOW = join(homedir(), 'AI/ComfyUI-Shared/api/flux2-klein-t2i.json');
const APP = 'Comfy Desktop';
const BOOT_MS = 3 * 60 * 1000;
const GEN_MS = 6 * 60 * 1000;
const OUT = 'scripts/blender/textures';
const RAW = '.loop/tmp/comfy';
const SHEET = '.loop/shots/T41-tiles.png';
const MAX_BYTES = 150 * 1024;

const STYLE = 'seamless tileable texture, straight top-down orthographic view, flat even lighting, no shadows, '
  + 'stylized hand-painted game ground texture, soft muted colours, uniform pattern filling the whole frame, '
  + 'no text, no letters, no people, no animals, no objects, no border';
const TILES = {
  'sand-dry': 'dry pale beach sand, fine grains, faint wind ripples, a few tiny broken shell flecks, warm muted beige',
  'sand-wet': 'wet packed beach sand at the waterline, darker muted tan, soft sheen, gentle ripple marks',
  planks: 'sun-bleached weathered wooden deck planks running horizontally, grey-tan driftwood, wood grain, small nail heads',
  water: 'calm shallow lagoon water surface, muted teal-blue, gentle soft caustic ripple pattern',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[comfy] ${m}`);

async function alive() {
  for (const h of HOSTS) {
    try {
      const r = await fetch(`${h}/system_stats`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        HOST = h;
        return true;
      }
    } catch {
      // not up on this port
    }
  }
  return false;
}

async function waitAlive(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await alive()) return true;
    await sleep(3000);
  }
  return false;
}

async function generate(workflow, name, prompt, seed) {
  const wf = structuredClone(workflow);
  wf['19'].inputs.text = `${STYLE}, ${prompt}`;
  wf['24'].inputs.noise_seed = seed;
  wf['28'].inputs.filename_prefix = `brawl-${name}`;
  const res = await fetch(`${HOST}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: wf, client_id: 'brawl-t41' }),
  });
  const body = await res.json();
  if (!res.ok || !body.prompt_id) throw new Error(`${name}: queue failed ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
  const end = Date.now() + GEN_MS;
  while (Date.now() < end) {
    await sleep(2000);
    const hist = await (await fetch(`${HOST}/history/${body.prompt_id}`)).json();
    const entry = hist[body.prompt_id];
    if (!entry) continue;
    if (entry.status?.status_str === 'error') throw new Error(`${name}: ${JSON.stringify(entry.status.messages).slice(0, 400)}`);
    const img = entry.outputs?.['28']?.images?.[0];
    if (!img) continue;
    const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
    return Buffer.from(await (await fetch(`${HOST}/view?${q}`)).arrayBuffer());
  }
  throw new Error(`${name}: no image after ${GEN_MS / 1000} s`);
}

async function writeJpeg(img, file) {
  for (const quality of [86, 80, 74, 68, 62]) {
    const buf = await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
      .removeAlpha().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buf.length <= MAX_BYTES) {
      writeFileSync(file, buf);
      return { quality, bytes: buf.length };
    }
  }
  throw new Error(`${file}: over ${MAX_BYTES} B even at q62`);
}

async function contactSheet(tiles) {
  const cell = 768;
  const comps = await Promise.all(tiles.map(async ({ img }, i) => ({
    input: await sharp(tileRepeat(img, 2).data, { raw: { width: img.w * 2, height: img.h * 2, channels: 4 } })
      .resize(cell, cell).png().toBuffer(),
    left: (i % 2) * cell,
    top: Math.floor(i / 2) * cell,
  })));
  const rows = Math.ceil(tiles.length / 2);
  await sharp({ create: { width: cell * 2, height: cell * rows, channels: 3, background: '#000' } })
    .composite(comps).png().toFile(SHEET);
}

async function main() {
  const argv = process.argv.slice(2);
  const keep = argv.includes('--keep');
  const names = argv.filter((a) => !a.startsWith('--'));
  const pick = names.length ? names : Object.keys(TILES);
  for (const n of pick) if (!TILES[n]) throw new Error(`unknown tile ${n} (${Object.keys(TILES).join(', ')})`);
  if (!existsSync(WORKFLOW)) throw new Error(`missing API workflow ${WORKFLOW}`);
  if (await alive()) {
    log('ComfyUI is already running (user session) → skipping');
    process.exit(2);
  }
  log(`starting ${APP} …`);
  const open = spawnSync('open', ['-a', APP], { encoding: 'utf8' });
  if (open.status !== 0) throw new Error(`open -a ${APP} failed: ${open.stderr}`);
  const t0 = Date.now();
  try {
    if (!(await waitAlive(BOOT_MS))) {
      log('ComfyUI did not answer within 3 min → skipping');
      process.exitCode = 3;
      return;
    }
    log(`up at ${HOST} after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const workflow = JSON.parse(readFileSync(WORKFLOW, 'utf8'));
    mkdirSync(OUT, { recursive: true });
    mkdirSync(RAW, { recursive: true });
    mkdirSync('.loop/shots', { recursive: true });
    const done = [];
    for (const [i, name] of pick.entries()) {
      const t = Date.now();
      const png = await generate(workflow, name, TILES[name], 4100 + i);
      writeFileSync(join(RAW, `${name}.png`), png);
      const { data, info } = await sharp(png).resize(1024, 1024, { fit: 'cover' }).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      const img = makeSeamless(downsample2x({ w: info.width, h: info.height, data }));
      const file = join(OUT, `${name}.jpg`);
      const { quality, bytes } = await writeJpeg(img, file);
      const s = seamScore(img);
      log(`${name}: ${((Date.now() - t) / 1000).toFixed(0)} s, ${file} q${quality} ${(bytes / 1024).toFixed(0)} KB, `
        + `seam x ${s.wrapX.toFixed(1)} y ${s.wrapY.toFixed(1)} vs interior ${s.interior.toFixed(1)}`);
      done.push({ name, img });
    }
    await contactSheet(done);
    log(`contact sheet ${SHEET} (${(statSync(SHEET).size / 1024).toFixed(0)} KB)`);
  } finally {
    if (!keep) {
      spawnSync('osascript', ['-e', `quit app "${APP}"`]);
      log(`quit ${APP}`);
    }
  }
}

main().catch((e) => {
  console.error(`[comfy] ${e.message}`);
  process.exit(1);
});
