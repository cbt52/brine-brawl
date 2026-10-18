import type { FighterDef } from './types.ts';

/** Elemental Weavers · Fire · DPS — a fire dancer who leaves a burning trail wherever she steps. */
export const ASHKA: FighterDef = {
  id: 'ashka',
  name: 'Ashka Flameheart',
  faction: 'weavers',
  element: 'fire',
  role: 'sharpshooter',
  blurb: 'A fire dancer in a red-gold sash; her ribbons write burning lines across the pier.',
  moves: { attack: 'Fire Darts', special: 'Flame Step', ult: 'Phoenix Ribbon' },
  radius: 28,
  maxHp: 100,
  speedMul: 1.06,
  ammo: 3,
  reload: 1.2,
  // Fire Darts: three quick needles on one line, cheap but they add up
  attack: { kind: 'projectile', count: 3, spread: 12, speed: 830, range: 470, dmg: 7, radius: 6, fx: 'fire-darts' },
  // Flame Step: a short dancer's step that scorches the floor behind her
  special: {
    kind: 'dash',
    dist: 240,
    dur: 0.24,
    contactDmg: 10,
    trail: true,
    trailZone: { radius: 46, dmg: 4, status: 'burn', statusSec: 1.5 },
    cd: 6.5,
    fx: 'flame-step',
  },
  // Phoenix Ribbon: one wide sweeping arc of fire that catches a whole half-circle
  ult: {
    kind: 'melee',
    arcDeg: 210,
    range: 200,
    dmg: 18,
    knockback: 140,
    status: 'burn',
    statusSec: 2.5,
    fx: 'phoenix-ribbon',
  },
  ultCharge: 120,
};
