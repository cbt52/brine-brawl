import type { FighterDef } from './types.ts';

/** The generic fighter: everyone who does not pick a kit joins as this one. */
export const DEFAULT_FIGHTER: FighterDef = {
  id: 'default',
  name: 'Deckhand',
  faction: 'bubblebottom',
  element: 'neutral',
  role: 'allrounder',
  blurb: 'A steady hand with a slingshot and a bad attitude about seagulls.',
  radius: 32,
  maxHp: 100,
  speedMul: 1,
  ammo: 3,
  reload: 1.2,
  attack: { kind: 'projectile', count: 1, spread: 0, speed: 900, range: 600, dmg: 20, radius: 8, fx: 'shot' },
  // soak the deck around the aim point: small, delayed, pushes enemies out
  special: { kind: 'aoe', at: 'aim', range: 300, radius: 95, delay: 0.25, dmg: 14, push: 90, cd: 7, fx: 'splash' },
  // three-shot fan
  ult: { kind: 'projectile', count: 3, spread: 22, speed: 950, range: 700, dmg: 26, radius: 10, fx: 'fan' },
  ultCharge: 140,
};
