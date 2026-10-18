import { TICK_HZ } from '../constants.ts';
import type { Element } from '../fighters/types.ts';
import type { Team } from './teams.ts';

/** Crew Combos (T28): two teammates' ults must land within this window … */
export const COMBO_WINDOW_SEC = 1.5;
/** … and inside this radius (or on the same victim) … */
export const COMBO_RADIUS = 300;
/** … to add a burst worth this fraction of the ult hit that completed the pair. */
export const COMBO_BONUS = 0.4;
/** radius of that bonus burst */
export const COMBO_BURST_RADIUS = 140;

/** One ult that landed on somebody (the combo bookkeeping keeps the last window of these). */
export interface UltHit {
  /** attacker */
  id: number;
  team: Team | null;
  el: Element;
  x: number;
  y: number;
  /** victim id: the same enemy counts even when the hits are farther apart than the radius */
  v: number;
  tick: number;
  /** damage of the hit, scaled by COMBO_BONUS for the burst */
  dmg: number;
}

const NAMES: readonly [Element, Element, string][] = [
  ['volt', 'water', 'Storm Surge'],
  ['air', 'fire', 'Firenado'],
  ['earth', 'water', 'Mudslide'],
  ['leaf', 'water', 'Bloom Burst'],
  ['earth', 'fire', 'Magma Pop'],
];

/** Combo name for an element pair (order-independent); the plain banner when no pair is special. */
export function comboName(a: Element, b: Element): string {
  for (const [x, y, name] of NAMES) {
    if ((a === x && b === y) || (a === y && b === x)) return name;
  }
  return 'Crew Combo!';
}

/**
 * The teammate ult hit that completes `hit`, or null: same crew, inside the window, and either the
 * same victim or within COMBO_RADIUS. The newest match wins, so a chain of three ults pairs the
 * closest two.
 */
export function comboPartner(
  hits: readonly UltHit[],
  hit: UltHit,
  windowTicks = Math.round(COMBO_WINDOW_SEC * TICK_HZ),
): UltHit | null {
  let best: UltHit | null = null;
  for (const h of hits) {
    if (h.id === hit.id) continue;
    if (h.team === null || h.team !== hit.team) continue;
    if (hit.tick - h.tick > windowTicks) continue;
    const sameVictim = h.v === hit.v;
    const near = Math.hypot(h.x - hit.x, h.y - hit.y) <= COMBO_RADIUS;
    if (!sameVictim && !near) continue;
    if (!best || h.tick > best.tick) best = h;
  }
  return best;
}
