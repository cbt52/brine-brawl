/**
 * Frame helpers for the 3D sprite pipeline: exact 2× box downsample, palette check,
 * figure height and the contact sheet (colour row, 48 px colour row, 48 px grayscale row).
 */
import sharp from 'sharp';

/** Read a PNG as raw RGBA. */
export async function readRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data };
}

/** 2×2 box filter with premultiplied alpha: flat regions keep their exact colour. */
export function downsample2x({ w, h, data }) {
  const ow = w >> 1;
  const oh = h >> 1;
  const out = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((y * 2 + dy) * w + x * 2 + dx) * 4;
        const al = data[i + 3];
        r += data[i] * al;
        g += data[i + 1] * al;
        b += data[i + 2] * al;
        a += al;
      }
      const o = (y * ow + x) * 4;
      if (a) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / 4);
    }
  }
  return { w: ow, h: oh, data: out };
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Exact-match pixel count per hex plus one sample position for each. */
export function paletteHits(img, hexes) {
  const want = new Map(hexes.map((h) => [h.toUpperCase(), { count: 0, at: null }]));
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.data[i * 4 + 3] !== 255) continue;
    const h = hex(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    const hit = want.get(h);
    if (!hit) continue;
    hit.count++;
    hit.at ??= [i % img.w, Math.floor(i / img.w)];
  }
  return want;
}

/** Colour of one pixel as #RRGGBB. */
export function pixelHex(img, x, y) {
  const i = (y * img.w + x) * 4;
  return hex(img.data[i], img.data[i + 1], img.data[i + 2]);
}

/** Opaque-ish bounding box (alpha > 32). */
export function alphaBox(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] <= 32) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Crop to the alpha > 0 box; `src` = where the crop sits in the full cell (Phaser `spriteSourceSize`). */
export function trimFrame(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!img.data[(y * img.w + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, 0, 0];
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) img.data.copy(data, y * w * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x1 + 1) * 4);
  return { w, h, data, src: { x: x0, y: y0, sw: img.w, sh: img.h } };
}

const BG = { r: 0x8a, g: 0x9a, b: 0xa8, alpha: 1 };

/**
 * Contact sheet. `rows` is a list of frame rows (a flat frame list is one row); each row gets
 * a 1× strip, a 48 px strip and a 48 px grayscale strip under it.
 */
export async function contactSheet(rows, file) {
  if (!Array.isArray(rows[0])) rows = [rows];
  const cell = rows[0][0].w;
  const small = 48;
  const gap = 8;
  const block = cell + small * 2 + gap * 3;
  const W = Math.max(...rows.map((r) => r.length)) * (cell + gap) + gap;
  const H = rows.length * block + gap;
  const comps = [];
  for (let r = 0; r < rows.length; r++) {
    const top = gap + r * block;
    for (let i = 0; i < rows[r].length; i++) {
      const f = rows[r][i];
      const raw = { width: f.w, height: f.h, channels: 4 };
      const left = gap + i * (cell + gap);
      const sm = await sharp(f.data, { raw }).resize(small, small, { kernel: 'lanczos3' }).png().toBuffer();
      const gray = await sharp(f.data, { raw })
        .resize(small, small, { kernel: 'lanczos3' })
        .recomb([[0.299, 0.587, 0.114], [0.299, 0.587, 0.114], [0.299, 0.587, 0.114]])
        .png()
        .toBuffer();
      comps.push({ input: f.data, raw, left, top });
      comps.push({ input: sm, left: left + (cell - small) / 2, top: top + gap + cell });
      comps.push({ input: gray, left: left + (cell - small) / 2, top: top + gap * 2 + cell + small });
    }
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } }).composite(comps).png().toFile(file);
}
