import { BUSHES, type Rect } from '../arena/docks.ts';

/** Anything that hides like kelp (a bush rect already lives in `BUSHES`; steam is a circle). */
export interface HideCircle {
  x: number;
  y: number;
  r: number;
}

/** a fighter inside kelp or a steam cloud is spotted from at most this far (world units) */
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

/** True when the point lies inside any kelp bush rect (the docks kelp unless a World plays another layout). */
export function inBush(x: number, y: number, bushes: readonly Rect[] = BUSHES): boolean {
  for (const b of bushes) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/**
 * Visibility filter shared by the server snapshot, the bots and the client.
 * You always see yourself; a hidden fighter is otherwise revealed by attacking (1 s) or by
 * standing within `BUSH_SEE_RANGE`.
 */
export function canSee(
  viewer: Body, target: Body, hides: readonly HideCircle[] = [], bushes: readonly Rect[] = BUSHES,
): boolean {
  if (viewer.id === target.id) return true;
  if ((target.revealT ?? 0) > 0) return true;
  if (!inBush(target.x, target.y, bushes) && !inHides(target, hides)) return true;
  return Math.hypot(target.x - viewer.x, target.y - viewer.y) <= BUSH_SEE_RANGE;
}

/** True when the point lies inside one of the dynamic hiding circles (steam clouds). */
export function inHides(p: { x: number; y: number }, hides: readonly HideCircle[]): boolean {
  for (const h of hides) if (Math.hypot(p.x - h.x, p.y - h.y) <= h.r) return true;
  return false;
}
