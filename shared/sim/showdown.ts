/**
 * Showdown (backlog #6, slice 1): a battle-royale ring. After a grace period the safe circle
 * around the island centre shrinks, and the tide keeps rising with it, so bodies outside the ring
 * take edge damage. Pure data + pure functions, no DOM/Node, so the server, bots, tests and the
 * client ring share one source of truth. Mode wiring (room flag, bots, HUD) comes in a later slice.
 */
import { WORLD_W, WORLD_H } from '../constants.ts';

/** Seconds into the round before the ring starts to close. */
export const SHOWDOWN_START_SEC = 30;
/** Seconds from the first closing step until the ring stops at its minimum. */
export const SHOWDOWN_SHRINK_SEC = 120;
/** Ring radius at the start (covers most of the 2400×1600 world, clips the corners). */
export const SHOWDOWN_FULL_R = 1000;
/** Smallest the ring ever gets. */
export const SHOWDOWN_MIN_R = 260;
/** Edge damage per second for a body outside the ring, once it has started closing. */
export const SHOWDOWN_EDGE_DPS = 15;

/** Island centre the ring closes towards. */
export const SHOWDOWN_CENTER = { x: WORLD_W / 2, y: WORLD_H / 2 };

/** Shrink progress 0 (ring full, tide out) → 1 (ring at minimum), linear in time. */
export function shrinkFrac(t: number): number {
  if (!(t > SHOWDOWN_START_SEC)) return 0;
  return Math.min(1, (t - SHOWDOWN_START_SEC) / SHOWDOWN_SHRINK_SEC);
}

/** Flood level for the shallows during Showdown: the tide only ever rises with the ring. */
export function showdownTideLevel(t: number): number {
  return shrinkFrac(t);
}

/** Current safe-circle radius (units) at round time `t`. */
export function safeRadius(t: number): number {
  return SHOWDOWN_FULL_R + (SHOWDOWN_MIN_R - SHOWDOWN_FULL_R) * shrinkFrac(t);
}

/** True when a point lies outside the safe circle at round time `t`. */
export function outsideRing(x: number, y: number, t: number): boolean {
  const dx = x - SHOWDOWN_CENTER.x;
  const dy = y - SHOWDOWN_CENTER.y;
  return dx * dx + dy * dy > safeRadius(t) ** 2;
}

/** Edge damage dealt to a body at (x, y) over `dt` seconds (0 inside the ring). */
export function edgeDamage(x: number, y: number, t: number, dt: number): number {
  if (!(dt > 0) || !(t > SHOWDOWN_START_SEC)) return 0;
  return outsideRing(x, y, t) ? SHOWDOWN_EDGE_DPS * dt : 0;
}
