/**
 * Lane cannons (backlog #1 "Taffy Galleon", slice 1): a cannon bolted to the deck fires a long
 * bar down its lane on a steady clock. Each volley telegraphs for CANNON_WARN_SEC, then the bar
 * travels out of the muzzle. Pure functions of time, so the server, bots, tests and the client
 * telegraph share one source of truth. `World.stepCannons` applies the bar's damage (slice 3a).
 */

/** A cannon bolted to the deck: muzzle position, aim, and its own clock. */
export interface Cannon {
  x: number;
  y: number;
  /** aim angle (rad), 0 = +x, π/2 = +y */
  a: number;
  /** seconds from one volley's telegraph to the next */
  period: number;
  /** seconds before the first volley */
  phase: number;
  /** how far the bar travels from the muzzle (units) */
  range: number;
}

/** seconds the telegraph shows before a volley's bar leaves the muzzle */
export const CANNON_WARN_SEC = 1;
/** bar speed, units per second */
export const SHOT_SPEED = 620;
/** length of the moving bar */
export const SHOT_LEN = 90;
/** width of the moving bar */
export const SHOT_WIDTH = 46;
/** damage one body takes from a volley it is standing in (once per volley, see World.stepCannons) */
export const CANNON_DMG = 30;

export interface Volley {
  /** index of this volley on its cannon (0, 1, 2…), so callers can count one hit per volley */
  k: number;
  stage: 'warn' | 'fire';
  /** seconds since this stage began */
  age: number;
}

/** Seconds from the bar leaving the muzzle until its tail has cleared `range`. */
export function shotLife(range: number): number {
  return (range + SHOT_LEN) / SHOT_SPEED;
}

/** What `c` is doing at time `t` (seconds): null while idle, else the telegraph or the moving bar. */
export function volleyAt(c: Cannon, t: number): Volley | null {
  if (t < c.phase) return null;
  const k = Math.floor((t - c.phase) / c.period);
  const start = c.phase + k * c.period;
  const age = t - start;
  if (age < CANNON_WARN_SEC) return { k, stage: 'warn', age };
  const fired = age - CANNON_WARN_SEC;
  if (fired > shotLife(c.range)) return null;
  return { k, stage: 'fire', age: fired };
}

/** Is a fighter-sized body (centre x,y, radius r) inside the moving bar of this volley right now? */
export function volleyHits(c: Cannon, v: Volley, x: number, y: number, r: number): boolean {
  if (v.stage !== 'fire') return false;
  const dx = x - c.x;
  const dy = y - c.y;
  const along = dx * Math.cos(c.a) + dy * Math.sin(c.a);
  const across = -dx * Math.sin(c.a) + dy * Math.cos(c.a);
  const travelled = v.age * SHOT_SPEED;
  const head = Math.min(travelled, c.range);
  const tail = Math.max(0, travelled - SHOT_LEN);
  if (tail > head) return false;
  return Math.abs(across) <= SHOT_WIDTH / 2 + r && along >= tail - r && along <= head + r;
}
