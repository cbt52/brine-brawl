import type { FighterDef } from './types.ts';

/** Bubblebottom · Air · artist — a sulking cuttlefish with a dented tuba and strong opinions about art. */
export const SQUALL: FighterDef = {
  id: 'squall',
  name: 'Squall Mopefin',
  faction: 'bubblebottom',
  element: 'air',
  role: 'support',
  blurb: 'A cuttlefish composer whose every recital clears the dock — mostly by blowing everyone off it.',
  moves: { attack: 'Sour Note', special: 'Ink Cloud', ult: 'Grand Recital' },
  radius: 28,
  maxHp: 104,
  speedMul: 1.1,
  ammo: 3,
  reload: 1.15,
  // Sour Note: one flat honk out of the tuba bell — a wide cone of bad air
  attack: { kind: 'melee', arcDeg: 100, range: 235, dmg: 15, knockback: 70, fx: 'sour-note' },
  // Ink Cloud: a blot of ink that hangs in the water and hides whoever sits in it
  special: {
    kind: 'aoe',
    at: 'aim',
    range: 260,
    radius: 125,
    delay: 0.25,
    dmg: 0,
    zoneSec: 3.5,
    tickDmg: 2,
    hides: true,
    cd: 10,
    fx: 'ink-cloud',
  },
  // Grand Recital: the big crescendo — a pulse of air shoving the whole ring outward
  ult: { kind: 'aoe', at: 'self', radius: 290, delay: 0.3, dmg: 32, push: 160, fx: 'grand-recital' },
  ultCharge: 130,
};
