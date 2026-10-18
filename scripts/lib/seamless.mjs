/**
 * Seamless-tile helpers for generated ground textures (T41). Images are raw RGBA `{ w, h, data }`.
 * `makeSeamless` cross-fades each axis with a half-rolled copy of itself: the rolled copy is
 * continuous across the wrap, the original is continuous in the middle, so the blend (weight 0 at
 * the edges, 1 inside) wraps cleanly. X first, then Y on the X result, so both axes stay seamless.
 */

const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Weight of the original at position i of n: 0 on the wrap edge, 1 once `band` (0..1 of the half) inside. */
export function edgeWeight(i, n, band) {
  const d = Math.min(i + 0.5, n - i - 0.5) / (n / 2);
  return smoothstep(d / band);
}

function blendAxis({ w, h, data }, axis, band) {
  const out = Buffer.alloc(data.length);
  const n = axis === 'x' ? w : h;
  const half = n >> 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = edgeWeight(axis === 'x' ? x : y, n, band);
      const rx = axis === 'x' ? (x + half) % w : x;
      const ry = axis === 'y' ? (y + half) % h : y;
      const i = (y * w + x) * 4;
      const j = (ry * w + rx) * 4;
      for (let c = 0; c < 4; c++) out[i + c] = Math.round(data[i + c] * k + data[j + c] * (1 - k));
    }
  }
  return { w, h, data: out };
}

/** Make an image tile seamlessly in both axes. `band` = share of each half used for the fade. */
export function makeSeamless(img, band = 0.5) {
  return blendAxis(blendAxis(img, 'x', band), 'y', band);
}

/**
 * Seam score: mean RGB step across the wrap edges vs the mean step between neighbouring
 * interior columns/rows. A seamless tile has wrap ≈ interior (ratio ≈ 1).
 */
export function seamScore({ w, h, data }) {
  const px = (x, y, c) => data[(y * w + x) * 4 + c];
  const step = (ax, ay, bx, by) => (
    Math.abs(px(ax, ay, 0) - px(bx, by, 0)) + Math.abs(px(ax, ay, 1) - px(bx, by, 1)) + Math.abs(px(ax, ay, 2) - px(bx, by, 2))
  ) / 3;
  let wrapX = 0, wrapY = 0, inner = 0, innerN = 0;
  for (let y = 0; y < h; y++) wrapX += step(w - 1, y, 0, y);
  for (let x = 0; x < w; x++) wrapY += step(x, h - 1, x, 0);
  for (let y = 0; y < h; y += 7) for (let x = 0; x < w - 1; x++) { inner += step(x, y, x + 1, y); innerN++; }
  for (let x = 0; x < w; x += 7) for (let y = 0; y < h - 1; y++) { inner += step(x, y, x, y + 1); innerN++; }
  return { wrapX: wrapX / h, wrapY: wrapY / w, interior: inner / innerN };
}

/** Repeat an image `n`×`n` (tiled preview). */
export function tileRepeat({ w, h, data }, n = 2) {
  const W = w * n;
  const out = Buffer.alloc(W * h * n * 4);
  for (let y = 0; y < h * n; y++) {
    for (let tx = 0; tx < n; tx++) data.copy(out, (y * W + tx * w) * 4, (y % h) * w * 4, ((y % h) + 1) * w * 4);
  }
  return { w: W, h: h * n, data: out };
}
