import type { FighterDef } from './types.ts';

/** Critterkin · Volt · skirmisher — fast in-and-out harasser with a stun engage. */
export const VOLTBUN: FighterDef = {
  id: 'voltbun',
  name: 'Voltbun',
  faction: 'critterkin',
  element: 'volt',
  role: 'skirmisher',
  blurb: 'A cheeky battery-tailed bunny who zaps in, stuns and hops out again.',
  moves: { attack: 'Spark Hop', special: 'Static Dash', ult: 'Thunder Burrow' },
  radius: 28,
  maxHp: 90,
  speedMul: 1.2,
  ammo: 4,
  reload: 0.9,
  // Spark Hop: two quick short bolts per shot
  attack: { kind: 'projectile', count: 2, spread: 10, speed: 1000, range: 480, dmg: 11, radius: 6, fx: 'spark' },
  // Static Dash: short dash that leaves a static-charged trail
  special: {
    kind: 'dash',
    dist: 260,
    dur: 0.16,
    contactDmg: 10,
    trail: true,
    trailZone: { radius: 72, dmg: 0, status: 'static', statusSec: 1.6 },
    cd: 6,
    fx: 'dash-static',
  },
  // Thunder Burrow: go underground, pop up at the aim point and stun everything nearby
  ult: { kind: 'burrow', dur: 0.6, range: 420, radius: 150, dmg: 28, status: 'stun', statusSec: 0.6, fx: 'burrow' },
  ultCharge: 120,
};
