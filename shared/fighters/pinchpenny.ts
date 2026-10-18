import type { FighterDef } from './types.ts';

/** Bubblebottom · Earth · bruiser — a greedy blue lobster shopkeeper with a cash register for a belly. */
export const PINCHPENNY: FighterDef = {
  id: 'pinchpenny',
  name: 'Boss Pinchpenny',
  faction: 'bubblebottom',
  element: 'earth',
  role: 'bruiser',
  blurb: 'A lobster shopkeeper who fights like he is collecting a debt: coins first, claws second, register last.',
  moves: { attack: 'Coin Flick', special: 'Claw Clamp', ult: 'Register Crush' },
  radius: 36,
  maxHp: 168,
  speedMul: 0.99,
  ammo: 3,
  reload: 1.35,
  // Coin Flick: two coins flicked flat, tunnelling through everyone in the line
  attack: {
    kind: 'projectile',
    count: 2,
    spread: 5,
    speed: 760,
    range: 640,
    dmg: 11,
    radius: 10,
    pierce: true,
    fx: 'coin-flick',
  },
  // Claw Clamp: one claw snaps shut and drags everything nearby in to be billed
  special: {
    kind: 'aoe',
    at: 'self',
    radius: 235,
    delay: 0,
    dmg: 9,
    pull: 145,
    status: 'heavy',
    statusSec: 1.5,
    cd: 6,
    fx: 'claw-clamp',
  },
  // Register Crush: he slams the whole register down — coins burst out of it
  ult: {
    kind: 'aoe',
    at: 'self',
    radius: 230,
    delay: 0.15,
    dmg: 18,
    dropGold: 3,
    fx: 'register-crush',
  },
  ultCharge: 140,
};
