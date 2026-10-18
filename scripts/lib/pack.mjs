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
 * Pack RGBA frames into one PNG + a Phaser JSON-hash atlas.
 * @param {{name: string, w: number, h: number, data: Buffer}[]} frames raw RGBA
 */
export async function packAtlas(frames, pngPath, jsonPath, opts = {}) {
  const { default: sharp } = await import('sharp');
  const { writeFileSync } = await import('node:fs');
  const { basename } = await import('node:path');
  const lay = layoutShelves(frames.map((f) => ({ id: f.name, w: f.w, h: f.h })), opts);
  const byName = new Map(frames.map((f) => [f.name, f]));
  const composites = lay.frames.map((p) => {
    const f = byName.get(p.id);
    return { input: f.data, raw: { width: f.w, height: f.h, channels: 4 }, left: p.x, top: p.y };
  });
  await sharp({ create: { width: lay.w, height: lay.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(pngPath);
  const json = { frames: {}, meta: { app: 'brine-brawl art3d', image: basename(pngPath), format: 'RGBA8888', size: { w: lay.w, h: lay.h }, scale: 1 } };
  for (const p of lay.frames) {
    json.frames[p.id] = {
      frame: { x: p.x, y: p.y, w: p.w, h: p.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
      sourceSize: { w: p.w, h: p.h },
    };
  }
  writeFileSync(jsonPath, JSON.stringify(json, null, 1) + '\n');
  return lay;
}
