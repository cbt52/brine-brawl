/**
 * App icons for the PWA manifest (T33). No image library: the pixels are computed here and written
 * as plain PNG (RGBA, filter 0, one zlib stream). The motif is the game's own doubloon over a lagoon:
 * gold ring + a teal wave, on the deep-teal UI colour.
 *   node scripts/gen-icon.mjs   → client/public/icons/icon-{192,512,maskable-512}.png
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('client/public/icons');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 0 outside the shape, 1 inside, feathered at the edge (cheap anti-aliasing). */
const disc = (d, r) => clamp01((r - d) * 1.4 + 0.5);
const ring = (d, r, w) => clamp01((w / 2 - Math.abs(d - r)) * 1.4 + 0.5);

/**
 * @param {number} size
 * @param {number} scale 1 = full bleed, 0.8 = maskable safe zone
 */
function draw(size, scale) {
  const px = Buffer.alloc(size * size * 4);
  const s = size * scale;
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // background: deep teal with a soft radial lift behind the coin
      const dx = (x - cx) / size;
      const dy = (y - cy) / size;
      const r = Math.hypot(dx, dy);
      let col = [mix(14, 26, clamp01(1 - r * 1.3)), mix(42, 54, clamp01(1 - r * 1.3)), mix(58, 71, clamp01(1 - r * 1.3))];

      // lagoon wave: two teal bands along the lower third
      const waveY = cy + s * 0.26 + Math.sin(((x - cx) / s) * Math.PI * 3) * s * 0.035;
      const waveA = clamp01((y - waveY) * 1.6 + 0.5);
      col = [mix(col[0], 46, waveA), mix(col[1], 196 - 60 * waveA, waveA), mix(col[2], 182, waveA)];

      // doubloon: gold disc with an inner hole, so it reads at 32 px too
      const d = Math.hypot(x - cx, y - cy + s * 0.02);
      const coin = disc(d, s * 0.3);
      const hole = disc(d, s * 0.11);
      const rim = ring(d, s * 0.3, s * 0.022);
      const gold = clamp01(coin - hole);
      col = [mix(col[0], 255, gold), mix(col[1], 201, gold), mix(col[2], 60, gold)];
      // rim highlight on the sun side, shadow on the far side
      col = [mix(col[0], 255, rim * 0.5), mix(col[1], 240, rim * 0.5), mix(col[2], 180, rim * 0.5)];

      const i = (y * size + x) * 4;
      px[i] = Math.round(col[0]);
      px[i + 1] = Math.round(col[1]);
      px[i + 2] = Math.round(col[2]);
      px[i + 3] = 255;
    }
  }
  return px;
}

fs.mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['maskable-512.png', 512, 0.8],
];
for (const [name, size, scale] of targets) {
  fs.writeFileSync(path.join(OUT, name), encodePng(size, draw(size, scale)));
  console.log(`${path.join(OUT, name)} · ${size}×${size}`);
}
