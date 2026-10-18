/**
 * Readability numbers for a rendered arena ground (TASKS-LOOP §2.11 "Readability"): HSV
 * saturation per pixel (mean / p95 / max) and pure-black pixels. Pure, works on raw RGB(A).
 */

/** HSV saturation of one sRGB colour, 0..1. */
export function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/** `{ mean, p95, max, black }` over every pixel of `{ data, channels }` (channels 3 or 4). */
export function saturationStats({ data, channels = 4 }) {
  const hist = new Uint32Array(101);
  let sum = 0;
  let n = 0;
  let max = 0;
  let black = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const s = saturation(data[i], data[i + 1], data[i + 2]);
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) black++;
    hist[Math.round(s * 100)]++;
    sum += s;
    max = Math.max(max, s);
    n++;
  }
  let acc = 0;
  let p95 = 0;
  for (let k = 0; k <= 100; k++) {
    acc += hist[k];
    if (acc >= n * 0.95) {
      p95 = k / 100;
      break;
    }
  }
  return { mean: n ? sum / n : 0, p95, max, black };
}
