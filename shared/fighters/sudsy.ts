import type { FighterDef } from './types.ts';

/** Bubblebottom · Water · support — a bath loofah with a spatula and a bubble problem. */
export const SUDSY: FighterDef = {
  id: 'sudsy',
  name: 'Sudsy Loofah',
  faction: 'bubblebottom',
  element: 'water',
  role: 'support',
  blurb: 'A squeaky-clean fry cook who lobs slow bouncing bubbles and seals rivals inside them.',
  moves: { attack: 'Bubble Volley', special: 'Bubble Trap', ult: 'Mega Bubble' },
  radius: 32,
  maxHp: 136,
  speedMul: 1.11,
  ammo: 3,
  reload: 1.22,
  // Bubble Volley: three slow bubbles that ricochet twice
  attack: {
    kind: 'projectile',
    count: 3,
    spread: 26,
    speed: 330,
    range: 520,
    dmg: 13,
    radius: 12,
    bounce: 2,
    fx: 'bubble',
  },
  // Bubble Trap: encases one enemy in a bubble for a second
  special: {
    kind: 'projectile',
    count: 1,
    spread: 0,
    speed: 520,
    range: 520,
    dmg: 8,
    radius: 16,
    status: 'trapped',
    statusSec: 1,
    cd: 6.5,
    fx: 'bubble-trap',
  },
  // Mega Bubble: a huge slow bubble that traps everything it rolls through
  ult: {
    kind: 'projectile',
    count: 1,
    spread: 0,
    speed: 230,
    range: 800,
    dmg: 17,
    radius: 40,
    pierce: true,
    status: 'trapped',
    statusSec: 1.6,
    fx: 'mega-bubble',
  },
  ultCharge: 130,
};
