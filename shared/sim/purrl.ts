import { WORLD_W, WORLD_H } from '../constants.ts';
import { OBSTACLES, SHALLOWS } from '../arena/docks.ts';

/**
 * Purrl (backlog #1): a sea snail that wanders the sand. The first hurt fighter it bumps into is
 * patched up by PURRL_HEAL, once per life. It is scenery, not a body: fighters walk over it.
 * The route comes from a tiny seeded LCG, so the server, the tests and the balance harness agree.
 */

export const PURRL_R = 20;
export const PURRL_HEAL = 10;
/** walking speed, units per second (a snail: slower than any fighter) */
export const PURRL_SPEED = 46;
/** seconds it rests between two legs */
export const PURRL_PAUSE = 1.2;

/** keep legs away from the world edge */
const MARGIN = 90;
/** clearance around coral walls: the snail's radius plus a little air */
const CLEAR = PURRL_R + 14;
/** distance at which a leg counts as reached */
const ARRIVE = 4;
/** spacing of the samples that check a leg against the coral */
const SAMPLE_GAP = 12;
/** how many random targets to try before resting and trying again later */
const TRIES = 24;

export interface Purrl {
  x: number;
  y: number;
  /** facing angle (rad), so the eyes lead the walk */
  a: number;
  /** current leg target */
  tx: number;
  ty: number;
  /** seconds left resting; > 0 while still resting */
  pause: number;
  /** LCG state for the next route pick */
  seed: number;
}

export function makePurrl(seed = 7): Purrl {
  return { x: 1200, y: 1200, a: 0, tx: 1200, ty: 1200, pause: 0, seed };
}

function nextRand(s: Purrl): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

/** Inside a coral wall, or within `pad` of one. */
function nearCoral(x: number, y: number, pad: number): boolean {
  for (const r of OBSTACLES) {
    if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return true;
  }
  return false;
}

function inShallows(x: number, y: number): boolean {
  return SHALLOWS.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

/** A straight leg that stays off the coral and out of the flood (sampled, so a thin wall cannot slip between). */
function clearLeg(x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / SAMPLE_GAP));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (nearCoral(x, y, CLEAR) || inShallows(x, y)) return false;
  }
  return true;
}

/** Pick the next leg: a dry sand spot the snail can reach in a straight line. */
function pickLeg(s: Purrl): void {
  for (let i = 0; i < TRIES; i++) {
    const x = MARGIN + nextRand(s) * (WORLD_W - 2 * MARGIN);
    const y = MARGIN + nextRand(s) * (WORLD_H - 2 * MARGIN);
    if (nearCoral(x, y, CLEAR) || inShallows(x, y) || !clearLeg(s.x, s.y, x, y)) continue;
    s.tx = x;
    s.ty = y;
    s.pause = 0;
    return;
  }
  // no clear leg this time: rest, then try again
  s.pause = PURRL_PAUSE;
}

/** Advance the snail by `dt` seconds: walk the current leg, rest at its end, then pick the next one. */
export function stepPurrl(s: Purrl, dt: number): void {
  if (s.pause > 0) {
    s.pause -= dt;
    if (s.pause <= 0) pickLeg(s);
    return;
  }
  const dx = s.tx - s.x;
  const dy = s.ty - s.y;
  const d = Math.hypot(dx, dy);
  if (d <= ARRIVE) {
    s.pause = PURRL_PAUSE;
    return;
  }
  const step = Math.min(d, PURRL_SPEED * dt);
  s.x += (dx / d) * step;
  s.y += (dy / d) * step;
  s.a = Math.atan2(dy, dx);
}
