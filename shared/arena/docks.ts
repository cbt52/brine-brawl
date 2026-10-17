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

function mirror(): Rect[] {
  const out: Rect[] = [];
  for (const r of QUAD) {
    out.push(r);
    out.push({ x: WORLD_W - r.x - r.w, y: r.y, w: r.w, h: r.h });
    out.push({ x: r.x, y: WORLD_H - r.y - r.h, w: r.w, h: r.h });
    out.push({ x: WORLD_W - r.x - r.w, y: WORLD_H - r.y - r.h, w: r.w, h: r.h });
  }
  return out;
}

export const OBSTACLES: Rect[] = mirror(); // 12 walls

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

// Placeholders until T14 (bushes) and T18 (tide).
export const BUSHES: Rect[] = [
  { x: 1000, y: 1000, w: 200, h: 140 },
  { x: 1200, y: 460, w: 200, h: 140 },
];

export const SHALLOWS: Rect[] = [{ x: 1000, y: 640, w: 400, h: 320 }];
