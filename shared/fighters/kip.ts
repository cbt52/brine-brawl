import type { FighterDef } from './types.ts';

/** Elemental Weavers · Neutral · trickster — a mud-faced teen who throws a bone boomerang and vanishes in smoke. */
export const KIP: FighterDef = {
  id: 'kip',
  name: 'Kip Boomer',
  faction: 'weavers',
  element: 'neutral',
  role: 'skirmisher',
  blurb: 'A lanky trickster with a bone-white boomerang; his shots come back for a second helping.',
  moves: { attack: 'Boomerang', special: 'Smoke Pop', ult: 'Triple Rang' },
  radius: 29,
  maxHp: 105,
  speedMul: 1.16,
  ammo: 3,
  reload: 1.0,
  // Boomerang: flies out, turns around and hits the same enemy a second time on the way home
  attack: {
    kind: 'projectile',
    count: 1,
    spread: 0,
    speed: 640,
    range: 400,
    dmg: 13,
    radius: 12,
    pierce: true,
    returns: true,
    fx: 'boomerang',
  },
  // Smoke Pop: a smoke cloud he slips out of, and his feet are quicker while it hangs there
  special: {
    kind: 'aoe',
    at: 'self',
    radius: 120,
    delay: 0,
    dmg: 0,
    zoneSec: 2.5,
    selfSpeedMul: 1.5,
    cd: 7,
    fx: 'smoke-pop',
  },
  // Triple Rang: three boomerangs fanned out — six chances to clip someone
  ult: {
    kind: 'projectile',
    count: 3,
    spread: 26,
    speed: 720,
    range: 460,
    dmg: 15,
    radius: 10,
    pierce: true,
    returns: true,
    fx: 'triple-rang',
  },
  ultCharge: 120,
};
