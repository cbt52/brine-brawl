import type { FighterDef } from './types.ts';

/** Saltwind · Fire · kicker — a pelican chef with a toque and two leggy kicks; the Wonderfruit heated his galley. */
export const BISQUE: FighterDef = {
  id: 'bisque',
  name: 'Bisque Legsworth',
  faction: 'saltwind',
  element: 'fire',
  role: 'bruiser',
  blurb: 'A pelican chef who never puts the ladle down; the whole kit is kick-shaped and served hot.',
  moves: { attack: 'Ladle Kick', special: 'Skillet Rocket Kick', ult: 'Five-Course Combo' },
  radius: 32,
  maxHp: 132,
  speedMul: 1.02,
  ammo: 3,
  reload: 1,
  // Ladle Kick: a straight leg out, ladle swinging behind for balance
  attack: { kind: 'melee', arcDeg: 85, range: 182, dmg: 20, knockback: 65, fx: 'ladle-kick' },
  // Skillet Rocket Kick: a screaming fire-kick that leaves a burning pan-track behind
  special: {
    kind: 'dash',
    dist: 320,
    dur: 0.26,
    contactDmg: 22,
    trail: true,
    trailZone: { radius: 55, dmg: 0, status: 'burn', statusSec: 1.5 },
    cd: 6.5,
    fx: 'skillet-rocket-kick',
  },
  // Five-Course Combo: five served kicks in a cone — starter, soup, fish, roast, dessert
  ult: {
    kind: 'aoe',
    at: 'self',
    radius: 205,
    delay: 0,
    dmg: 8,
    coneDeg: 110,
    zoneSec: 2,
    tickDmg: 5,
    status: 'burn',
    statusSec: 1.5,
    fx: 'five-course-combo',
  },
  ultCharge: 135,
};
