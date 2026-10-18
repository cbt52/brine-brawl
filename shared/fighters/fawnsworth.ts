import type { FighterDef } from './types.ts';

/** Saltwind Crew · Leaf · support — a seahorse surgeon in a top hat who ate the Grow-Fruit by accident. */
export const FAWNSWORTH: FighterDef = {
  id: 'fawnsworth',
  name: 'Doc Fawnsworth',
  faction: 'saltwind',
  element: 'leaf',
  role: 'support',
  blurb: 'A dapper seahorse surgeon: his darts sting enemies and stitch crewmates back together.',
  moves: { attack: 'Remedy Dart', special: 'Grow Form', ult: 'Field Surgery' },
  radius: 33,
  maxHp: 122,
  speedMul: 0.98,
  ammo: 3,
  reload: 1.15,
  // Remedy Dart: hurts whoever it meets, but a crewmate it reaches gets patched up instead
  attack: {
    kind: 'projectile',
    count: 1,
    spread: 0,
    speed: 700,
    range: 500,
    dmg: 12,
    radius: 10,
    allyHeal: 20,
    fx: 'remedy-dart',
  },
  // Grow Form: the Grow-Fruit swells him into a wall of a seahorse that shrugs off hits
  special: { kind: 'buff', sec: 4, dmgMul: 0.5, speedMul: 0.9, heal: 10, cd: 10, fx: 'grow-form' },
  // Field Surgery: an operating tent's worth of healing for everyone standing close
  ult: {
    kind: 'aoe',
    at: 'self',
    radius: 140,
    delay: 0,
    dmg: 0,
    zoneSec: 3,
    allyHeal: 9,
    fx: 'field-surgery',
  },
  ultCharge: 140,
};
