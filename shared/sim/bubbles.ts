import { WORLD_W, WORLD_H } from '../constants.ts';

/**
 * Bubble storm (backlog #17, slice 2a): a Weird Weather round where bubbles rise over the arena.
 * A fighter inside a bubble is carried up with it and walks slower. Pure data + pure functions,
 * no DOM/Node, so the server, prediction and the tests share one source of truth.
 */

export const BUBBLE_COUNT = 6;
export const BUBBLE_R = 46;
/** how fast a bubble rises, units per second */
export const BUBBLE_RISE = 70;
/** how fast a fighter inside a bubble is carried up, units per second */
export const BUBBLE_LIFT = 60;
/** walking speed multiplier while a fighter is inside a bubble */
export const BUBBLE_SLOW = 0.6;

export interface Bubble {
  id: number;
  x: number;
  y: number;
  r: number;
}

/** Lay the bubbles out on a fixed grid, staggered in height, so every round looks the same. */
export function makeBubbles(): Bubble[] {
  const out: Bubble[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    out.push({
      id: i + 1,
      x: WORLD_W * ((i + 0.5) / BUBBLE_COUNT),
      y: WORLD_H * (((i * 0.37) % 1) || 0.5),
      r: BUBBLE_R,
    });
  }
  return out;
}

/** Rise every bubble; one that leaves the top re-enters at the bottom edge of the arena. */
export function stepBubbles(list: Bubble[], dt: number): void {
  for (const b of list) {
    b.y -= BUBBLE_RISE * dt;
    if (b.y < -b.r) b.y += WORLD_H + 2 * b.r;
  }
}

/** True when a body of radius `r` at (x, y) overlaps any bubble. */
export function inBubble(list: readonly Bubble[] | undefined, x: number, y: number, r: number): boolean {
  if (!list) return false;
  for (const b of list) {
    if (Math.hypot(x - b.x, y - b.y) < b.r + r) return true;
  }
  return false;
}
