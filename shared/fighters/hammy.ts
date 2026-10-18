import type { FighterDef } from './types.ts';

/** Bubblebottom · Air · diver — a karate hamster in a fishbowl helmet with an air tank on his back. */
export const HAMMY: FighterDef = {
  id: 'hammy',
  name: 'Hammy Divedome',
  faction: 'bubblebottom',
  element: 'air',
  role: 'skirmisher',
  blurb: 'A karate hamster who dives at problems helmet-first; the fishbowl is armour and airway at once.',
  moves: { attack: 'Karate Chop', special: 'Tank Rocket', ult: 'Helmet Pop' },
  radius: 30,
  maxHp: 119,
  speedMul: 1.2,
  ammo: 4,
  reload: 0.66,
  // Karate Chop: a fast, short handblade — four chops per magazine
  attack: { kind: 'melee', arcDeg: 70, range: 172, dmg: 15, knockback: 35, fx: 'karate-chop' },
  // Tank Rocket: the air tank vents and launches him at the target, helmet forward
  special: { kind: 'dash', dist: 310, dur: 0.24, contactDmg: 17, cd: 5.5, fx: 'tank-rocket' },
  // Helmet Pop: the bowl pops off in a fizzy field that slows everyone standing in it
  ult: {
    kind: 'aoe',
    at: 'self',
    radius: 255,
    delay: 0,
    dmg: 7,
    zoneSec: 2.5,
    tickDmg: 2,
    status: 'heavy',
    statusSec: 3,
    fx: 'helmet-pop',
  },
  ultCharge: 120,
};
