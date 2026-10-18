import type { Rect } from '../arena/docks.ts';
import type { WallAbility } from '../fighters/types.ts';

/**
 * Temporary stone walls (Brak's Stone Wall, T22). A wall is an axis-aligned slab that blocks bodies
 * and shots until it is chewed through or its lifetime runs out. `World` keeps the list and feeds the
 * footprints into the same collision code as the coral obstacles, so the sim stays one system.
 */

/** Depth of a slab (the thin side). */
export const WALL_THICK = 34;

export interface Wall {
  id: number;
  owner: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  mhp: number;
  /** seconds left standing */
  left: number;
}

export function wallRect(w: Wall): Rect {
  return { x: w.x, y: w.y, w: w.w, h: w.h };
}

/** Footprints of every standing wall (the caller usually appends them to the static obstacles). */
export function wallRects(walls: readonly Wall[]): Rect[] {
  return walls.map(wallRect);
}

/**
 * Footprint of a wall cast: a slab across the aim, centred `range` units in front of the caster.
 * Collision (and shot blocking) is rect-based, so the slab snaps upright when the caster aims along x
 * and flat when it aims along y — a fighter always gets a wall across the lane they are facing.
 */
export function wallFor(
  x: number,
  y: number,
  aim: number,
  def: WallAbility,
): { x: number; y: number; w: number; h: number } {
  const cx = x + Math.cos(aim) * def.range;
  const cy = y + Math.sin(aim) * def.range;
  const upright = Math.abs(Math.cos(aim)) >= Math.abs(Math.sin(aim));
  const len = Math.max(WALL_THICK, def.len);
  const w = upright ? WALL_THICK : len;
  const h = upright ? len : WALL_THICK;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
}

/** Age the slabs by one tick; returns the ones still standing (expired or broken ones drop out). */
export function stepWalls(walls: readonly Wall[], dt: number): Wall[] {
  const keep: Wall[] = [];
  for (const w of walls) {
    w.left -= dt;
    if (w.left > 0 && w.hp > 0) keep.push(w);
  }
  return keep;
}
