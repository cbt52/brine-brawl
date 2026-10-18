import type { FighterDef } from './types.ts';

/** Critterkin · Air · trickster — an airy lavender ghost-moth with lantern antennae. */
export const GLOOMOTH: FighterDef = {
  id: 'gloomoth',
  name: 'Gloomoth',
  faction: 'critterkin',
  element: 'air',
  role: 'skirmisher',
  blurb: 'A night-light with wings: it dusts you blind, vanishes, then returns as a swarm of tiny lanterns.',
  moves: { attack: 'Dust Puff', special: 'Phase Flutter', ult: 'Lantern Swarm' },
  radius: 27,
  maxHp: 96,
  speedMul: 1.22,
  ammo: 3,
  reload: 0.8,
  // Dust Puff: a short cone of sleepy wing scale that leaves the target slow-footed (Heavy)
  attack: {
    kind: 'melee', arcDeg: 95, range: 165, dmg: 9, knockback: 20,
    status: 'heavy', statusSec: 2, fx: 'dust-puff',
  },
  // Phase Flutter: ghost out for a moment and reappear further along the aim
  special: { kind: 'burrow', dur: 0.8, range: 250, radius: 0, dmg: 0, cd: 7, fx: 'phase-flutter' },
  // Lantern Swarm: five small moths that seek the nearest body on their own
  ult: {
    kind: 'projectile', count: 5, spread: 60, speed: 250, range: 460, dmg: 11, radius: 9,
    homing: true, fx: 'lantern-swarm',
  },
  ultCharge: 110,
};
