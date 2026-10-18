import type { FighterDef } from './types.ts';

/** Saltwind Crew · Neutral · sharpshooter — a tall-tale teller with a slingshot the size of a mast. */
export const LENNY: FighterDef = {
  id: 'lenny',
  name: 'Longshot Lenny',
  faction: 'saltwind',
  element: 'neutral',
  role: 'sharpshooter',
  blurb: 'Every shot is a true story, he swears. The wooden Lenny he leaves behind is the honest one.',
  moves: { attack: 'Fib Shot', special: 'Decoy Lenny', ult: 'The Big Fib' },
  radius: 27,
  maxHp: 100,
  speedMul: 1.06,
  ammo: 2,
  reload: 1.42,
  // Fib Shot: one enormous slingshot slug that reaches across half the arena
  attack: { kind: 'projectile', count: 1, spread: 0, speed: 1200, range: 860, dmg: 18, radius: 7, fx: 'fib-shot' },
  // Decoy Lenny: a wooden stand-in takes the shots he was going to take
  special: { kind: 'summon', type: 'decoy', sec: 5, hp: 70, radius: 30, dist: 90, cd: 10, fx: 'decoy-lenny' },
  // The Big Fib: a rubber-duck bomb lobbed over the coral, then it goes off
  ult: {
    kind: 'projectile',
    count: 1,
    spread: 0,
    speed: 520,
    range: 480,
    dmg: 8,
    radius: 18,
    lob: true,
    aoeOnEnd: { radius: 130, dmg: 34 },
    fx: 'big-fib',
  },
  ultCharge: 125,
};
