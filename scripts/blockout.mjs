/**
 * 3D blockouts for every fighter — the lighting/shape guide the SVG sprites are derived from.
 *
 *   node scripts/blockout.mjs            # writes client/public/art/ref/<id>-{front,side,q34}.png
 *   node scripts/blockout.mjs voltbun    # one fighter
 *
 * Input is `client/public/art/ref/<id>.parts.json` (written by `scripts/art-gen.mjs`): the same parts the
 * SVG sprite is built from, as 2.5D geometry (x/y in world units, `depth` towards the camera). Because both
 * views come from one part list, sprite and blockout cannot drift apart.
 *
 * `three` is a local devDependency; there is no CDN and no network access. Three's WebGLRenderer needs a GPU
 * context, which Node does not have, so the rendering happens in the Chromium that ships with Playwright
 * (SwiftShader). Geometry, camera, lights and materials are all `three`.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const REF = path.join(ROOT, 'client/public/art/ref');
const THREE_DIR = path.join(ROOT, 'node_modules/three/build');
const SIZE = 128; // final PNG edge, px
const SS = 2; // supersampling factor for the WebGL render

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = fs
  .readdirSync(REF)
  .filter((f) => f.endsWith('.parts.json'))
  .filter((f) => only.length === 0 || only.includes(f.replace('.parts.json', '')));

if (files.length === 0) {
  console.error('blockout: no parts found — run `node scripts/art-gen.mjs` first');
  process.exit(1);
}

const models = files.map((f) => JSON.parse(fs.readFileSync(path.join(REF, f), 'utf8')));

/* ------------------------------------------------------------------ server */

const MIME = { '.js': 'text/javascript', '.html': 'text/html' };
const pageHtml = `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<canvas id="c"></canvas>
<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const SIZE = ${SIZE};
const SS = ${SS};
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('c'),
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(SIZE * SS, SIZE * SS, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

/** One light rig for the whole roster: key from the top-left-front, cool fill from the back-right. */
function rig(scene) {
  scene.add(new THREE.AmbientLight(0xbfd8e8, 1.15));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.5);
  key.position.set(-3.2, 4.2, 3.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fc9e8, 0.85);
  fill.position.set(3.0, -1.2, -2.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(0.5, 2.4, -3.5);
  scene.add(rim);
}

/** parts.json -> meshes. Ellipses become ellipsoids, everything else an extruded slab. */
function build(model) {
  const group = new THREE.Group();
  for (const p of model.parts) {
    const colour = new THREE.Color(p.c);
    const mat = new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.62,
      metalness: 0.05,
      flatShading: false,
    });
    let geo;
    if (p.k === 'e') {
      geo = new THREE.SphereGeometry(1, 20, 14);
      geo.scale(p.w / 2, p.h / 2, Math.max(0.06, p.d / 2));
    } else {
      const t = Math.max(0.06, Math.min(p.d, Math.min(p.w, p.h) * 0.9));
      geo = new THREE.BoxGeometry(Math.max(0.05, p.w), Math.max(0.05, p.h), t);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, p.y, p.depth);
    group.add(mesh);
  }
  // soft contact shadow on the ground plane
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.78, 32),
    new THREE.MeshBasicMaterial({ color: 0x0a1a24, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -0.30, 0);
  group.add(shadow);
  return group;
}

const VIEWS = {
  front: { az: 0, el: 0.06 },
  q34: { az: 0.62, el: 0.12 }, // three-quarter, the look the sprite is drawn in
  side: { az: Math.PI / 2, el: 0.06 },
};

const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
const down = document.createElement('canvas');
down.width = SIZE;
down.height = SIZE;
const ctx = down.getContext('2d');

window.renderAll = (models) => {
  const out = {};
  for (const model of models) {
    for (const [name, view] of Object.entries(VIEWS)) {
      const scene = new THREE.Scene();
      rig(scene);
      const group = build(model);
      scene.add(group);
      // auto-frame: centre the model and pull the camera back until it fills ~85 % of the frame
      const box = new THREE.Box3().setFromObject(group);
      const centre = box.getCenter(new THREE.Vector3());
      group.position.x -= centre.x;
      group.position.y -= centre.y;
      const height = Math.max(0.8, box.max.y - box.min.y, box.max.x - box.min.x);
      const dist = height * 2.55;

      camera.position.set(Math.sin(view.az) * dist, Math.sin(view.el) * dist, Math.cos(view.az) * dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(renderer.domElement, 0, 0, SIZE, SIZE);
      out[model.id + '-' + name] = down.toDataURL('image/png');
    }
  }
  return out;
};
window.ready = true;
</script>`;

const server = http.createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(pageHtml);
    return;
  }
  if (url.startsWith('/three/')) {
    const file = path.join(THREE_DIR, path.basename(url));
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('missing ' + url);
      return;
    }
    res.writeHead(200, { 'content-type': MIME['.js'] });
    res.end(fs.readFileSync(file));
    return;
  }
  res.writeHead(404).end('nope');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const browser = await chromium.launch();
let written = 0;
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 15000 });
  const shots = await page.evaluate((m) => window.renderAll(m), models);
  for (const [key, dataUrl] of Object.entries(shots)) {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(REF, `${key}.png`), Buffer.from(base64, 'base64'));
    written++;
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`blockout: ${written} PNGs (${models.length} fighters × 3 views) → client/public/art/ref/`);
