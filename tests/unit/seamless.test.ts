import { describe, it, expect } from 'vitest';
import { edgeWeight, makeSeamless, seamScore, tileRepeat } from '../../scripts/lib/seamless.mjs';

/** A horizontal + vertical gradient: hard seam on both wrap edges. */
const gradient = (w: number, h: number) => {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = Math.round((x / (w - 1)) * 255);
      data[i + 1] = Math.round((y / (h - 1)) * 255);
      data[i + 2] = 90;
      data[i + 3] = 255;
    }
  }
  return { w, h, data };
};

describe('seamless tiles', () => {
  it('edgeWeight is 0-ish on the wrap edge, 1 in the middle, symmetric', () => {
    expect(edgeWeight(0, 64, 0.5)).toBeLessThan(0.02);
    expect(edgeWeight(32, 64, 0.5)).toBe(1);
    expect(edgeWeight(5, 64, 0.5)).toBeCloseTo(edgeWeight(58, 64, 0.5), 6);
  });

  it('makeSeamless removes the wrap seam of a gradient', () => {
    const img = gradient(64, 48);
    const before = seamScore(img);
    expect(before.wrapX).toBeGreaterThan(80);
    expect(before.wrapY).toBeGreaterThan(80);
    const after = seamScore(makeSeamless(img));
    expect(after.wrapX).toBeLessThan(after.interior * 3 + 2);
    expect(after.wrapY).toBeLessThan(after.interior * 3 + 2);
  });

  it('tileRepeat doubles each axis and keeps the pixels', () => {
    const img = gradient(8, 6);
    const t = tileRepeat(img, 2);
    expect([t.w, t.h]).toEqual([16, 12]);
    const at = (o: { w: number; data: Buffer }, x: number, y: number) => o.data.readUInt32LE((y * o.w + x) * 4);
    expect(at(t, 11, 9)).toBe(at(img, 3, 3));
  });
});
