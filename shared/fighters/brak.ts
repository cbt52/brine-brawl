import type { FighterDef } from './types.ts';

/** Weavers · Earth · bruiser — a stocky stone-shaper with granite gauntlets who fights behind his own wall. */
export const BRAK: FighterDef = {
  id: 'brak',
  name: 'Brak Stonefist',
  faction: 'weavers',
  element: 'earth',
  role: 'bruiser',
  blurb: 'A stocky stone-shaper in a fur-trimmed hat; punches like a landslide, then builds a wall about it.',
  moves: { attack: 'Gauntlet Pound', special: 'Stone Wall', ult: 'Rockslide' },
  radius: 36,
  maxHp: 155,
  speedMul: 1.01,
  ammo: 3,
  reload: 1.3,
  // Gauntlet Pound: a heavy two-fisted swing that leaves the target heavy-footed
  attack: { kind: 'melee', arcDeg: 100, range: 185, dmg: 28, knockback: 70, status: 'heavy', statusSec: 1.5, fx: 'gauntlet-pound' },
  // Stone Wall: a slab of deck stone that blocks bodies and shots for 4 s
  special: { kind: 'wall', range: 130, len: 200, sec: 4, hp: 60, cd: 7, fx: 'stone-wall' },
  // Rockslide: the deck bucks at the aim point and buries whoever is standing there
  ult: {
    kind: 'aoe',
    at: 'aim',
    range: 280,
    radius: 175,
    delay: 0.35,
    dmg: 26,
    status: 'heavy',
    statusSec: 2.5,
    fx: 'rockslide',
  },
  ultCharge: 150,
};
