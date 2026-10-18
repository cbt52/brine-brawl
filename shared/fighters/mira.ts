import type { FighterDef } from './types.ts';

/** Weavers · Water · controller — keeps enemies wet, shoved away or dragged together. */
export const MIRA: FighterDef = {
  id: 'mira',
  name: 'Mira Tidecaller',
  faction: 'weavers',
  element: 'water',
  role: 'support',
  blurb: 'A shell-braided tide-weaver who soaks the deck and pulls stragglers into the deep.',
  moves: { attack: 'Water Whip', special: 'Tide Push', ult: 'Maelstrom' },
  radius: 30,
  maxHp: 105,
  speedMul: 1,
  ammo: 3,
  reload: 1.1,
  // Water Whip: long thin lash that soaks the target
  attack: { kind: 'melee', arcDeg: 55, range: 250, dmg: 18, knockback: 40, status: 'wet', statusSec: 2.5, fx: 'whip' },
  // Tide Push: cone shove in front of her
  special: {
    kind: 'aoe',
    at: 'self',
    radius: 250,
    delay: 0,
    dmg: 10,
    push: 220,
    coneDeg: 80,
    status: 'wet',
    statusSec: 2,
    cd: 7,
    fx: 'tide',
  },
  // Maelstrom: a vortex that drags everything toward its centre while it ticks
  ult: {
    kind: 'aoe',
    at: 'aim',
    range: 320,
    radius: 150,
    delay: 0.25,
    dmg: 8,
    tickDmg: 6,
    tickPull: 30,
    zoneSec: 2,
    fx: 'maelstrom',
  },
  ultCharge: 130,
};
