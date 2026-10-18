/**
 * Atlas packing for 3D sprite frames.
 * `layoutShelves` is pure (unit-tested); `packAtlas` composes the PNG with `sharp`.
 */

/**
 * Shelf layout: tallest first (ties keep input order), left to right, a new shelf when the row is full.
 * Width is the smallest power of two that fits the total area (≥ the widest rect), doubled up to `maxW`
 * until the height fits `maxH`. Throws when nothing fits.
 * @param {{id: string, w: number, h: number}[]} rects
 * @returns {{w: number, h: number, frames: {id: string, x: number, y: number, w: number, h: number}[]}}
 */
export function layoutShelves(rects, { maxW = 1024, maxH = 1024, pad = 2 } = {}) {
  if (!rects.length) return { w: 0, h: 0, frames: [] };
  const order = rects.map((r, i) => ({ ...r, i })).sort((a, b) => b.h - a.h || a.i - b.i);
  const widest = Math.max(...rects.map((r) => r.w + pad));
  const area = rects.reduce((s, r) => s + (r.w + pad) * (r.h + pad), 0);
  let w = 1;
  while (w < Math.max(widest, Math.sqrt(area))) w *= 2;
  for (; w <= maxW; w *= 2) {
    const placed = shelves(order, w, pad);
    if (placed.h <= maxH) {
      placed.frames.sort((a, b) => a.i - b.i);
      return { w: placed.w, h: placed.h, frames: placed.frames.map(({ id, x, y, w: fw, h: fh }) => ({ id, x, y, w: fw, h: fh })) };
    }
  }
  throw new Error(`layoutShelves: ${rects.length} frames do not fit ${maxW}×${maxH}`);
}

function shelves(order, width, pad) {
  const frames = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let usedW = 0;
  for (const r of order) {
    if (x > 0 && x + r.w > width) {
      y += rowH + pad;
      x = 0;
      rowH = 0;
    }
    frames.push({ id: r.id, i: r.i, x, y, w: r.w, h: r.h });
    usedW = Math.max(usedW, x + r.w);
    x += r.w + pad;
    rowH = Math.max(rowH, r.h);
  }
  return { w: usedW, h: y + rowH, frames };
}

/**
 * Pack RGBA frames into one PNG + a Phaser JSON-hash atlas. A trimmed frame carries
 * `src: {x, y, sw, sh}` (its offset inside the `sw`×`sh` source cell). `palette: true` writes an
 * indexed PNG (`indexed-png.mjs`; the `keep` hexes stay exact) to stay inside the byte budget.
 * @param {{name: string, w: number, h: number, data: Buffer, src?: {x: number, y: number, sw: number, sh: number}}[]} frames raw RGBA
 */
export async function packAtlas(frames, pngPath, jsonPath, { palette = false, keep = [], ...opts } = {}) {
  const { writeFileSync } = await import('node:fs');
  const { basename } = await import('node:path');
  const lay = layoutShelves(frames.map((f) => ({ id: f.name, w: f.w, h: f.h })), opts);
  const byName = new Map(frames.map((f) => [f.name, f]));
  const img = Buffer.alloc(lay.w * lay.h * 4);
  for (const p of lay.frames) {
    const f = byName.get(p.id);
    for (let y = 0; y < f.h; y++) img.set(f.data.subarray(y * f.w * 4, (y + 1) * f.w * 4), ((p.y + y) * lay.w + p.x) * 4);
  }
  if (palette) {
    const { encodeIndexedPng, quantize } = await import('./indexed-png.mjs');
    writeFileSync(pngPath, encodeIndexedPng(lay.w, lay.h, quantize(img, { keep })));
  } else {
    const { default: sharp } = await import('sharp');
    await sharp(img, { raw: { width: lay.w, height: lay.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(pngPath);
  }
  const json = { frames: {}, meta: { app: 'brine-brawl art3d', image: basename(pngPath), format: 'RGBA8888', size: { w: lay.w, h: lay.h }, scale: 1 } };
  for (const p of lay.frames) {
    const src = byName.get(p.id).src;
    json.frames[p.id] = {
      frame: { x: p.x, y: p.y, w: p.w, h: p.h },
      rotated: false,
      trimmed: !!src,
      spriteSourceSize: { x: src?.x ?? 0, y: src?.y ?? 0, w: p.w, h: p.h },
      sourceSize: { w: src?.sw ?? p.w, h: src?.sh ?? p.h },
    };
  }
  writeFileSync(jsonPath, JSON.stringify(json, null, 1) + '\n');
  return lay;
}
