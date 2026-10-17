import { WORLD_W, WORLD_H } from '../constants.ts';
import type { Rect } from '../arena/docks.ts';

export interface Body {
  x: number;
  y: number;
  r: number;
}

/** Push a circle out of an AABB (mutates b). Returns true if it moved. */
export function pushOutRect(b: Body, rc: Rect): boolean {
  const cx = Math.max(rc.x, Math.min(b.x, rc.x + rc.w));
  const cy = Math.max(rc.y, Math.min(b.y, rc.y + rc.h));
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= b.r * b.r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    b.x += (dx / d) * (b.r - d);
    b.y += (dy / d) * (b.r - d);
    return true;
  }
  // centre inside the rect: exit through the nearest side
  const l = b.x - rc.x;
  const r = rc.x + rc.w - b.x;
  const t = b.y - rc.y;
  const bt = rc.y + rc.h - b.y;
  const m = Math.min(l, r, t, bt);
  if (m === l) b.x = rc.x - b.r;
  else if (m === r) b.x = rc.x + rc.w + b.r;
  else if (m === t) b.y = rc.y - b.r;
  else b.y = rc.y + rc.h + b.r;
  return true;
}

export function clampToWorld(b: Body): void {
  b.x = Math.max(b.r, Math.min(WORLD_W - b.r, b.x));
  b.y = Math.max(b.r, Math.min(WORLD_H - b.r, b.y));
}

export function resolveWalls(b: Body, walls: Rect[]): void {
  for (let i = 0; i < 2; i++) for (const w of walls) pushOutRect(b, w);
  clampToWorld(b);
}

/** Soft separation: each overlapping pair is pushed apart by `k` of the overlap per call. */
export function separate(bodies: Body[], k = 0.5): void {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const c = bodies[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const min = a.r + c.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.001;
      const push = ((min - d) * k) / 2;
      const nx = d2 > 1e-9 ? dx / d : 1;
      const ny = d2 > 1e-9 ? dy / d : 0;
      a.x -= nx * push;
      a.y -= ny * push;
      c.x += nx * push;
      c.y += ny * push;
    }
  }
}
