import type { FighterDef } from './types.ts';

/** Saltwind · Neutral · duelist — two sabers and a third blade in a mechanical crab-claw; the Fruit gave her the extra arm. */
export const SABLE: FighterDef = {
  id: 'sable',
  name: 'Sable Tripleblade',
  faction: 'saltwind',
  element: 'neutral',
  role: 'skirmisher',
  blurb: 'A one-eyed swordswoman with a crab-claw arm that swings a third blade nobody expects.',
  moves: { attack: 'Twin Slash', special: 'Claw Dash Cut', ult: 'Three-Tide Tempest' },
  radius: 29,
  maxHp: 115,
  speedMul: 1.12,
  ammo: 3,
  reload: 0.85,
  // Twin Slash: both sabers in one wide, fast arc — cheap per hit, but the arc is huge
  attack: { kind: 'melee', arcDeg: 150, range: 185, dmg: 15, knockback: 30, fx: 'twin-slash' },
  // Claw Dash Cut: the claw arm drags her through the first thing she touches
  special: { kind: 'dash', dist: 290, dur: 0.22, contactDmg: 20, cd: 6, fx: 'claw-dash-cut' },
  // Three-Tide Tempest: a spinning three-blade cut that catches everyone around her, three times
  ult: {
    kind: 'aoe',
    at: 'self',
    radius: 185,
    delay: 0,
    dmg: 12,
    zoneSec: 1,
    tickDmg: 8,
    fx: 'three-tide-tempest',
  },
  ultCharge: 130,
};
