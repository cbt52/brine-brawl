import type { FighterDef } from './types.ts';

/** Bubblebottom · Volt · gadgeteer — a tiny krill genius riding a clunky mech suit two sizes too big. */
export const KRILL: FighterDef = {
  id: 'krill',
  name: 'Teeny Krill',
  faction: 'bubblebottom',
  element: 'volt',
  role: 'skirmisher',
  blurb: 'Barely knee-high, entirely armed. Drives a mech suit he built from a kettle and three batteries.',
  moves: { attack: 'Laser Pew', special: 'Mini-Turret', ult: 'Mech Max' },
  radius: 26,
  maxHp: 96,
  speedMul: 1.12,
  ammo: 4,
  reload: 0.72,
  // Laser Pew: a thin hot line out of the suit's monocle lens
  attack: { kind: 'projectile', count: 1, spread: 0, speed: 1150, range: 480, dmg: 13, radius: 6, status: 'static', statusSec: 1.5, fx: 'laser-pew' },
  // Mini-Turret: folds a little tripod turret out of the suit's backpack
  special: {
    kind: 'summon',
    type: 'turret',
    sec: 6,
    hp: 60,
    radius: 18,
    dist: 75,
    fireEvery: 0.6,
    dmg: 8,
    range: 380,
    status: 'static',
    statusSec: 1,
    cd: 11,
    fx: 'mini-turret',
  },
  // Mech Max: the suit telescopes up and fires one huge piercing beam
  ult: { kind: 'projectile', count: 1, spread: 0, speed: 1000, range: 780, dmg: 30, radius: 26, pierce: true, status: 'static', statusSec: 2, fx: 'mech-max' },
  ultCharge: 135,
};
