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
  left: number;
  dmg: number;
  r: number;
}
