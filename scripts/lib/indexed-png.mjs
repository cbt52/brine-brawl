/**
 * Indexed (palette) PNG for the 3D sprite atlases (§2.11 budget: ≤ 350 KB).
 * The flat toon colours must come out exactly, which libimagequant does not promise for small
 * areas, so the palette is built here: fully transparent, then the `keep` hexes, then the most
 * frequent exact RGBA colours, then median-cut boxes over everything else (mostly the outline's
 * anti-aliasing). Every pixel maps to its nearest entry. Pure apart from `node:zlib`.
 */
import zlib from 'node:zlib';

const keyOf = (d, i) => (d[i + 3] ? ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0 : 0);
const rgbaOf = (k) => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255];

function dist(a, b) {
  const w = (a[3] + b[3]) / 510;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2], da = a[3] - b[3];
  return (dr * dr + dg * dg + db * db) * w + da * da * 2;
}

/** Split boxes of [rgba, count] at the weighted median of their widest channel. */
function medianCut(colours, boxes) {
  const out = [colours];
  while (out.length < boxes) {
    let best = -1, bestScore = 0, bestCh = 0;
    out.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 4; ch++) {
        let lo = 255, hi = 0, n = 0;
        for (const [c, cnt] of box) {
          lo = Math.min(lo, c[ch]);
          hi = Math.max(hi, c[ch]);
          n += cnt;
        }
        const score = (hi - lo) * Math.sqrt(n);
        if (score > bestScore) [best, bestScore, bestCh] = [i, score, ch];
      }
    });
    if (best < 0) break;
    const box = out[best].sort((a, b) => a[0][bestCh] - b[0][bestCh]);
    const total = box.reduce((s, [, n]) => s + n, 0);
    let acc = 0, cut = 1;
    for (; cut < box.length - 1; cut++) {
      acc += box[cut - 1][1];
      if (acc >= total / 2) break;
    }
    out.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }
  return out.map((box) => {
    const s = [0, 0, 0, 0];
    let n = 0;
    for (const [c, cnt] of box) {
      for (let ch = 0; ch < 4; ch++) s[ch] += c[ch] * cnt;
      n += cnt;
    }
    return s.map((v) => Math.round(v / n));
  });
}

/**
 * @param {Uint8Array} data RGBA pixels
 * @returns {{palette: number[][], index: Uint8Array}} palette entries are [r, g, b, a]
 */
export function quantize(data, { maxColours = 256, keep = [], exact = 192 } = {}) {
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const k = keyOf(data, i);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const chosen = [0];
  const seen = new Set(chosen);
  const add = (k) => {
    if (seen.has(k) || chosen.length >= maxColours) return;
    seen.add(k);
    chosen.push(k);
  };
  for (const h of keep) add((parseInt(h.slice(1), 16) * 256 + 255) >>> 0);
  const byCount = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [k] of byCount) {
    if (chosen.length >= Math.min(exact, maxColours)) break;
    add(k);
  }
  const palette = chosen.map(rgbaOf);
  const rest = byCount.filter(([k]) => !seen.has(k)).map(([k, n]) => [rgbaOf(k), n]);
  if (rest.length) palette.push(...medianCut(rest, maxColours - palette.length));

  const lookup = new Map(chosen.map((k, i) => [k, i]));
  const index = new Uint8Array(data.length / 4);
  for (let i = 0; i < index.length; i++) {
    const k = keyOf(data, i * 4);
    let j = lookup.get(k);
    if (j === undefined) {
      const c = rgbaOf(k);
      let best = Infinity;
      palette.forEach((p, pi) => {
        const d = dist(c, p);
        if (d < best) [best, j] = [d, pi];
      });
      lookup.set(k, j);
    }
    index[i] = j;
  }
  return { palette, index };
}

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** PNG colour type 3 (8-bit indices, PLTE + tRNS), filter 0 on every row. */
export function encodeIndexedPng(w, h, { palette, index }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) raw.set(index.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette.flatMap((p) => p.slice(0, 3)))),
    chunk('tRNS', Buffer.from(palette.map((p) => p[3]))),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
