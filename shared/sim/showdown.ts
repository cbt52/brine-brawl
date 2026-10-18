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
/** Edge damage lands in chunks this long (like the burn), so the damage FX does not fire at 30 Hz. */
export const SHOWDOWN_EDGE_TICK_SEC = 0.5;

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

/** Units inside the ring edge where bots already turn back (before any edge damage lands). */
export const SHOWDOWN_RING_MARGIN_U = 90;

/**
 * Heading back towards the island centre for a body that is within `margin` units of the ring
 * edge or outside it; `null` while it is comfortably inside (bots use this to flee the edge).
 */
export function edgeHeading(x: number, y: number, t: number, margin = SHOWDOWN_RING_MARGIN_U): number | null {
  if (!(t > SHOWDOWN_START_SEC)) return null; // no edge damage before the ring starts to close
  const dx = SHOWDOWN_CENTER.x - x;
  const dy = SHOWDOWN_CENTER.y - y;
  if (Math.hypot(dx, dy) < safeRadius(t) - margin) return null;
  return Math.atan2(dy, dx);
}

/** What the last-standing check reads from a fighter (`SimPlayer` already has all of it). */
export interface RingBody {
  id: number;
  x: number;
  y: number;
  /** crew 0/1; `null` in a free-for-all, where every fighter is its own side */
  team: number | null;
  down: boolean;
}

/**
 * Last-standing finish (backlog #20): once the ring is closing, the round ends as soon as exactly one
 * side still has a fighter standing inside the ring. Downed fighters wait for their respawn and do not
 * count, and a side that is only outside the ring does not count either.
 */
export function lastSideInRing(bodies: RingBody[], t: number): boolean {
  if (!(t > SHOWDOWN_START_SEC)) return false;
  const sides = new Set<string>();
  for (const b of bodies) {
    if (b.down || outsideRing(b.x, b.y, t)) continue;
    sides.add(b.team === null ? `p${b.id}` : `c${b.team}`);
  }
  return sides.size === 1;
}
