import { WORLD_W, WORLD_H } from '../constants.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

// One quadrant (top-left) of the layout; mirrored on both axes for symmetry.
const QUAD: Rect[] = [
  { x: 380, y: 260, w: 160, h: 60 },
  { x: 700, y: 140, w: 60, h: 200 },
  { x: 560, y: 560, w: 120, h: 120 },
];

export function mirrorOf(quad: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of quad) {
    out.push(r);
    out.push({ x: WORLD_W - r.x - r.w, y: r.y, w: r.w, h: r.h });
    out.push({ x: r.x, y: WORLD_H - r.y - r.h, w: r.w, h: r.h });
    out.push({ x: WORLD_W - r.x - r.w, y: WORLD_H - r.y - r.h, w: r.w, h: r.h });
  }
  return out;
}

export const OBSTACLES: Rect[] = mirrorOf(QUAD); // 12 coral walls

export const SPAWNS: Point[] = [
  { x: 200, y: 200 },
  { x: 1200, y: 160 },
  { x: 2200, y: 200 },
  { x: 2240, y: 800 },
  { x: 2200, y: 1400 },
  { x: 1200, y: 1440 },
  { x: 200, y: 1400 },
  { x: 160, y: 800 },
];

// Kelp patches: hiding spots. Mirrored on both axes so no side is favoured.
const QUAD_BUSH: Rect[] = [
  { x: 300, y: 880, w: 180, h: 120 },
  { x: 880, y: 1180, w: 180, h: 130 },
];

export const BUSHES: Rect[] = [
  ...mirrorOf(QUAD_BUSH),
  { x: 1000, y: 1000, w: 200, h: 140 },
  { x: 1200, y: 460, w: 200, h: 140 },
];

export const SHALLOWS: Rect[] = [{ x: 1000, y: 640, w: 400, h: 320 }];

export const DECOR: Rect[] = [
  { x: 140, y: 560, w: 54, h: 54 },
  { x: 2206, y: 990, w: 54, h: 54 },
  { x: 690, y: 1300, w: 62, h: 44 },
  { x: 1660, y: 200, w: 62, h: 44 },
  { x: 1160, y: 780, w: 44, h: 44 },
  { x: 2010, y: 700, w: 60, h: 42 },
  { x: 340, y: 1180, w: 60, h: 42 },
  { x: 1560, y: 1330, w: 50, h: 50 },
];
