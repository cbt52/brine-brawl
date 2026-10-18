import type { FighterDef } from './types.ts';

/** Weavers · Air · sharpshooter — a wind-whistling kid in an oversized poncho; twin darts and a whirlwind. */
export const PIP: FighterDef = {
  id: 'pip',
  name: 'Pip Windwhistle',
  faction: 'weavers',
  element: 'air',
  role: 'sharpshooter',
  blurb: 'A small wind-whistler in an oversized poncho; shoots two darts at a time and never quite lands.',
  moves: { attack: 'Gust Darts', special: 'Kite Lift', ult: 'Whirlwind' },
  radius: 28,
  maxHp: 95,
  speedMul: 1.18,
  ammo: 3,
  reload: 0.95,
  // Gust Darts: a tight pair of fast darts, the lightest attack in the roster but easy to land twice
  attack: { kind: 'projectile', count: 2, spread: 8, speed: 860, range: 540, dmg: 7, radius: 6, fx: 'gust-darts' },
  // Kite Lift: hops along the wind, clipping whoever is in the way (keeps going)
  special: { kind: 'dash', dist: 300, dur: 0.28, contactDmg: 12, cd: 6.5, fx: 'kite-lift' },
  // Whirlwind: a spinning updraft that grinds and drags everything toward its eye
  ult: {
    kind: 'aoe',
    at: 'aim',
    range: 260,
    radius: 165,
    delay: 0.2,
    dmg: 10,
    tickDmg: 4,
    tickPull: 40,
    zoneSec: 2.5,
    status: 'heavy',
    statusSec: 1.5,
    fx: 'whirlwind',
  },
  ultCharge: 120,
};
