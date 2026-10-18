import { WORLD_W } from '../constants.ts';
import type { Cannon } from '../sim/cannon.ts';
import { type Point, type Rect, mirrorOf } from './docks.ts';

/**
 * Taffy Galleon deck (backlog #1 "Taffy Galleon", slice 2): the second arena's layout data.
 * Not wired yet; the World still reads the docks constants. Masts and crates are mirrored on
 * both axes like the docks coral, and the cannon lanes (y 420 and y 1180) are kept clear of them.
 */

// One quadrant (top-left) of the deck; mirrored on both axes for symmetry.
const QUAD: Rect[] = [
  { x: 560, y: 250, w: 50, h: 50 }, // mast
  { x: 900, y: 560, w: 120, h: 70 }, // crate stack
  { x: 900, y: 300, w: 200, h: 40 }, // hatch
];

export const GALLEON_OBSTACLES: Rect[] = mirrorOf(QUAD);

export const GALLEON_SPAWNS: Point[] = [
  { x: 200, y: 200 },
  { x: 1200, y: 160 },
  { x: 2200, y: 200 },
  { x: 2240, y: 800 },
  { x: 2200, y: 1400 },
  { x: 1200, y: 1440 },
  { x: 200, y: 1400 },
  { x: 160, y: 800 },
];

// Four guns on the rails, two per side, firing across the deck. Staggered phases so the
// volleys never all land on the same beat; every period is longer than one full volley.
export const GALLEON_CANNONS: Cannon[] = [
  { x: 120, y: 420, a: 0, period: 5, phase: 1.5, range: 1500 },
  { x: WORLD_W - 120, y: 420, a: Math.PI, period: 5, phase: 4, range: 1500 },
  { x: 120, y: 1180, a: 0, period: 5, phase: 3, range: 1500 },
  { x: WORLD_W - 120, y: 1180, a: Math.PI, period: 5, phase: 0.5, range: 1500 },
];
