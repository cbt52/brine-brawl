import type { FighterDef } from './types.ts';

/** Saltwind · Neutral · bruiser — the Taffy-Fruit made his arms absurdly long and stretchy. */
export const NOODLE: FighterDef = {
  id: 'noodle',
  name: "Cap'n Noodle",
  faction: 'saltwind',
  element: 'neutral',
  role: 'bruiser',
  blurb: 'A lanky rubber-armed captain who reaches across the pier and yanks himself into the fight.',
  radius: 34,
  maxHp: 145,
  speedMul: 0.97,
  ammo: 3,
  reload: 1.25,
  // Taffy Jab: a long stretchy punch thrown well past normal melee range
  attack: { kind: 'melee', arcDeg: 40, range: 235, dmg: 22, knockback: 70, fx: 'taffy-jab' },
  // Sling Grab: rubber-band launch that slams into the first enemy it reaches
  special: {
    kind: 'dash',
    dist: 360,
    dur: 0.2,
    contactDmg: 26,
    stopOnContact: true,
    cd: 7,
    fx: 'sling-grab',
  },
  // Taffy Typhoon: a cone of rapid punches that keeps ticking
  ult: {
    kind: 'aoe',
    at: 'self',
    radius: 250,
    delay: 0,
    dmg: 12,
    coneDeg: 95,
    zoneSec: 1,
    tickDmg: 7,
    fx: 'taffy-typhoon',
  },
  ultCharge: 140,
};
