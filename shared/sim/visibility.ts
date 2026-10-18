import { BUSHES } from '../arena/docks.ts';

/** a fighter inside kelp is spotted from at most this far (world units) */
export const BUSH_SEE_RANGE = 200;
/** how long attacking keeps you revealed (seconds) */
export const REVEAL_SEC = 1;

export interface Body {
  id: number;
  x: number;
  y: number;
  /** seconds of "just attacked" reveal left */
  revealT?: number;
}

/** True when the point lies inside any kelp bush rect. */
export function inBush(x: number, y: number): boolean {
  for (const b of BUSHES) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/**
 * Visibility filter shared by the server snapshot, the bots and the client.
 * You always see yourself; a hidden fighter is otherwise revealed by attacking (1 s) or by
 * standing within `BUSH_SEE_RANGE`.
 */
export function canSee(viewer: Body, target: Body): boolean {
  if (viewer.id === target.id) return true;
  if ((target.revealT ?? 0) > 0) return true;
  if (!inBush(target.x, target.y)) return true;
  return Math.hypot(target.x - viewer.x, target.y - viewer.y) <= BUSH_SEE_RANGE;
}
