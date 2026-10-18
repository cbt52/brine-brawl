import { WORLD_W, WORLD_H } from '../constants.ts';

/**
 * Jellyfish rain (backlog #30, slice 2b): a Weird Weather round where a few jellies drift over the
 * arena. Every few seconds one lunges along its heading, and a fighter it touches gets stung. Pure
 * data + pure functions, no DOM/Node, so the server, the tests and the client drawing share one
 * source of truth. Jellies are time-driven (no random rolls), so every round looks the same.
 */

export const JELLY_COUNT = 4;
export const JELLY_R = 34;
/** drifting speed, units per second */
export const JELLY_DRIFT = 70;
/** lunge speed, units per second */
export const JELLY_DASH = 300;
/** how long one lunge lasts, seconds */
export const JELLY_DASH_SEC = 0.6;
/** a lunge starts every this many seconds */
export const JELLY_DASH_EVERY = 4;
/** damage per sting */
export const JELLY_STING = 6;
/** seconds before the same jelly can sting the same fighter again */
export const JELLY_STING_CD = 1;

export interface Jelly {
  id: number;
  x: number;
  y: number;
  r: number;
  /** base heading in radians; the wobble is added on top every step */
  head: number;
  /** jelly clock in seconds, drives the wobble and the lunge timing */
  t: number;
  /** seconds until each fighter (by id) can be stung again */
  cd: Map<number, number>;
}

/** Lay the jellies out on a fixed grid, each with its own heading and clock phase. */
export function makeJellies(): Jelly[] {
  const out: Jelly[] = [];
  for (let i = 0; i < JELLY_COUNT; i++) {
    out.push({
      id: i + 1,
      x: WORLD_W * ((i + 0.5) / JELLY_COUNT),
      y: WORLD_H * (0.25 + 0.5 * (((i * 0.61) % 1) || 0.5)),
      r: JELLY_R,
      head: i * 1.3,
      t: i * 1.1,
      cd: new Map(),
    });
  }
  return out;
}

/** True while the jelly is mid-lunge. */
export function jellyLunging(j: Jelly): boolean {
  return j.t % JELLY_DASH_EVERY < JELLY_DASH_SEC;
}

/** Drift (or lunge) every jelly, bounce it off the arena edges, and tick the sting cooldowns. */
export function stepJellies(list: Jelly[], dt: number): void {
  for (const j of list) {
    j.t += dt;
    const a = j.head + 0.5 * Math.sin(j.t * 0.9);
    const speed = jellyLunging(j) ? JELLY_DASH : JELLY_DRIFT;
    j.x += Math.cos(a) * speed * dt;
    j.y += Math.sin(a) * speed * dt;
    if (j.x < j.r) { j.x = j.r; j.head = Math.PI - j.head; }
    if (j.x > WORLD_W - j.r) { j.x = WORLD_W - j.r; j.head = Math.PI - j.head; }
    if (j.y < j.r) { j.y = j.r; j.head = -j.head; }
    if (j.y > WORLD_H - j.r) { j.y = WORLD_H - j.r; j.head = -j.head; }
    for (const [id, left] of j.cd) {
      if (left - dt <= 0) j.cd.delete(id);
      else j.cd.set(id, left - dt);
    }
  }
}

/** True when a body of radius `r` at (x, y) touches the jelly. */
export function jellyTouches(j: Jelly, x: number, y: number, r: number): boolean {
  return Math.hypot(x - j.x, y - j.y) < j.r + r;
}
