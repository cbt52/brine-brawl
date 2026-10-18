import type { FighterDef } from './types.ts';

/** Critterkin · Fire · bruiser — a soot-nosed red-panda cub that sets the pier alight and heals in it. */
export const EMBERCUB: FighterDef = {
  id: 'embercub',
  name: 'Embercub',
  faction: 'critterkin',
  element: 'fire',
  role: 'bruiser',
  blurb: 'A red-panda cub with a glowing ember ring on its tail; everything it touches ends up on fire.',
  moves: { attack: 'Flame Swipe', special: 'Ember Roll', ult: 'Bonfire' },
  radius: 34,
  maxHp: 140,
  speedMul: 0.95,
  ammo: 3,
  reload: 1.15,
  // Flame Swipe: a wide paw swipe that leaves the target burning
  attack: { kind: 'melee', arcDeg: 100, range: 200, dmg: 21, knockback: 55, status: 'burn', statusSec: 3, fx: 'flame-swipe' },
  // Ember Roll: rolls forward, scorching a burning trail behind the ball
  special: {
    kind: 'dash',
    dist: 300,
    dur: 0.3,
    contactDmg: 18,
    trail: true,
    trailZone: { radius: 62, dmg: 0, status: 'burn', statusSec: 1.5 },
    cd: 7,
    fx: 'ember-roll',
  },
  // Bonfire: a burning zone at the aim point that hurts enemies and patches Embercub up
  ult: {
    kind: 'aoe',
    at: 'aim',
    range: 200,
    radius: 140,
    delay: 0.3,
    dmg: 12,
    tickDmg: 5,
    zoneSec: 3,
    status: 'burn',
    statusSec: 2,
    selfHeal: 4,
    fx: 'bonfire',
  },
  ultCharge: 130,
};
