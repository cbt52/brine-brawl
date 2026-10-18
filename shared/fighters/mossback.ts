import type { FighterDef } from './types.ts';

/** Critterkin · Leaf · tank — a bonsai-shelled tortoise that seeds, shrugs off hits and roots the deck. */
export const MOSSBACK: FighterDef = {
  id: 'mossback',
  name: 'Mossback',
  faction: 'critterkin',
  element: 'leaf',
  role: 'bruiser',
  blurb: 'A squat tortoise with a tiny bonsai on its shell; slow, stubborn and impossible to shove off the pier.',
  moves: { attack: 'Seed Spit', special: 'Shell Spin', ult: 'Overgrowth' },
  radius: 38,
  maxHp: 155,
  speedMul: 0.88,
  ammo: 3,
  reload: 1.52,
  // Seed Spit: a three-seed spread that tangles whoever it touches
  attack: {
    kind: 'projectile',
    count: 3,
    spread: 24,
    speed: 620,
    range: 520,
    dmg: 9,
    radius: 8,
    status: 'tangled',
    statusSec: 2.5,
    fx: 'seed-spit',
  },
  // Shell Spin: pulls everything into the shell — half damage taken while it spins
  special: { kind: 'buff', dmgMul: 0.5, sec: 2, cd: 8, fx: 'shell-spin' },
  // Overgrowth: roots burst out of the deck, damaging and rooting everything around the aim point
  ult: {
    kind: 'aoe',
    at: 'aim',
    range: 300,
    radius: 190,
    delay: 0.3,
    dmg: 20,
    tickDmg: 4,
    zoneSec: 1.5,
    status: 'tangled',
    statusSec: 3,
    rootSec: 1.2,
    fx: 'overgrowth',
  },
  ultCharge: 150,
};
