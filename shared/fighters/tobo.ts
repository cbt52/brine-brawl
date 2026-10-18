import type { FighterDef } from './types.ts';

/** Elemental Weavers · Volt · support — a jolly uncle with a teapot and a lightning moustache. */
export const TOBO: FighterDef = {
  id: 'tobo',
  name: 'Uncle Tobo',
  faction: 'weavers',
  element: 'volt',
  role: 'support',
  blurb: 'A round, jolly uncle who brews tea that burns and lightning that goes straight through.',
  moves: { attack: 'Hot Tea Splash', special: 'Tea Break', ult: 'Redirect Bolt' },
  radius: 34,
  maxHp: 130,
  speedMul: 0.98,
  ammo: 3,
  reload: 1.2,
  // Hot Tea Splash: a cone of scalding tea that leaves the target burning a little
  attack: { kind: 'melee', arcDeg: 110, range: 150, dmg: 15, knockback: 40, status: 'burn', statusSec: 1.5, fx: 'hot-tea' },
  // Tea Break: he sits down for a cuppa and patches himself up over three seconds
  special: {
    kind: 'aoe',
    at: 'self',
    radius: 60,
    delay: 0,
    dmg: 0,
    zoneSec: 3,
    selfHeal: 8,
    cd: 8,
    fx: 'tea-break',
  },
  // Redirect Bolt: a huge line of lightning that punches through everything in its lane
  ult: {
    kind: 'projectile',
    count: 1,
    spread: 0,
    speed: 1500,
    range: 950,
    dmg: 30,
    radius: 14,
    pierce: true,
    status: 'static',
    statusSec: 1,
    fx: 'redirect-bolt',
  },
  ultCharge: 135,
};
