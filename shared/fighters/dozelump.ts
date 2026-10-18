import type { FighterDef } from './types.ts';

/** Critterkin · Water · tank — a sleepy giant manatee-blob with a nightcap and a drool bubble. */
export const DOZELUMP: FighterDef = {
  id: 'dozelump',
  name: 'Dozelump',
  faction: 'critterkin',
  element: 'water',
  role: 'bruiser',
  blurb: 'Half asleep, twice your weight: a belly bump to move you, a nap to heal, then the whole mattress lands.',
  moves: { attack: 'Belly Bump', special: 'Snooze', ult: 'Body Slam' },
  radius: 38,
  maxHp: 176,
  speedMul: 0.94,
  ammo: 3,
  reload: 1.25,
  // Belly Bump: a wide, slow shove that sends the target skidding
  attack: { kind: 'melee', arcDeg: 110, range: 178, dmg: 23, knockback: 210, fx: 'belly-bump' },
  // Snooze: 40 HP back, but the body stays planted for the whole snooze (speedMul 0 = rooted)
  special: { kind: 'buff', heal: 40, speedMul: 0, sec: 1.2, cd: 8, fx: 'snooze' },
  // Body Slam: dive onto the aim point and land as an area hit
  ult: { kind: 'burrow', dur: 0.45, range: 330, radius: 150, dmg: 22, fx: 'body-slam' },
  ultCharge: 120,
};
