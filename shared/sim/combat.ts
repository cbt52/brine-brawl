import type { StatusKind } from '../fighters/types.ts';

/** Default-fighter combat numbers (kept for tests and legacy imports; kits carry their own). */
export const PROJ_SPEED = 900;
export const PROJ_RANGE = 600;
export const PROJ_DMG = 20;
export const PROJ_RADIUS = 8;
export const MAX_AMMO = 3;
export const RELOAD_SEC = 1.2;
/** minimum time between two shots */
export const FIRE_GAP_SEC = 0.2;
export const MAX_HP = 100;
export const RESPAWN_SEC = 3;
export const SHIELD_SEC = 1.5;

export interface Projectile {
  id: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** distance left before it expires */
  left: number;
  dmg: number;
  r: number;
  /** passes through enemies (each one is hit once) */
  pierce?: boolean;
  /** wall bounces left */
  bounces?: number;
  /** ignores walls */
  lob?: boolean;
  /** damage blob on expiry or first hit */
  aoeOnEnd?: { radius: number; dmg: number };
  /** status applied to every enemy it hits (bubble trap) */
  status?: StatusKind;
  statusSec?: number;
  /** enemies already hit by a piercing shot */
  hit?: Set<number>;
}
