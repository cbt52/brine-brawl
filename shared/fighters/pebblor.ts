import type { FighterDef } from './types.ts';

/** Critterkin · Earth · thrower — a chubby rock chick with a gem crest and stubby wings. */
export const PEBBLOR: FighterDef = {
  id: 'pebblor',
  name: 'Pebblor',
  faction: 'critterkin',
  element: 'earth',
  role: 'sharpshooter',
  blurb: 'Hatcher of the quarry: lobs gravel over walls, turns to granite, then rolls the whole nest at you.',
  moves: { attack: 'Pebble Lob', special: 'Hunker', ult: 'Avalanche Egg' },
  radius: 32,
  maxHp: 130,
  speedMul: 0.95,
  ammo: 3,
  reload: 1.1,
  // Pebble Lob: an arcing stone that clears walls and bursts into a Heavy dust blob on landing
  attack: {
    kind: 'projectile', count: 1, spread: 0, speed: 400, range: 520, dmg: 8, radius: 12,
    lob: true, aoeOnEnd: { radius: 95, dmg: 10, status: 'heavy', statusSec: 1.5 }, fx: 'pebble-lob',
  },
  // Hunker: pull everything in, turn to stone — one second where nothing gets through
  special: { kind: 'buff', dmgMul: 0, sec: 1, cd: 8, fx: 'hunker' },
  // Avalanche Egg: a boulder-sized egg that rolls on through the whole crew
  ult: { kind: 'projectile', count: 1, spread: 0, speed: 300, range: 640, dmg: 18, radius: 30, pierce: true, fx: 'avalanche-egg' },
  ultCharge: 130,
};
