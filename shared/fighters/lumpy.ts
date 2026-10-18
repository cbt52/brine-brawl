import type { FighterDef } from './types.ts';

/** Bubblebottom · Earth · tank goof — a sea cucumber in a party hat who wins fights by lying down on them. */
export const LUMPY: FighterDef = {
  id: 'lumpy',
  name: 'Lumpy',
  faction: 'bubblebottom',
  element: 'earth',
  role: 'bruiser',
  blurb: 'A lime-green sea cucumber who showed up to the wrong party and stayed. Naps through the damage.',
  moves: { attack: 'Flop Slap', special: 'Rock Nap', ult: 'Big Nap Quake' },
  radius: 36,
  maxHp: 180,
  speedMul: 0.86,
  ammo: 3,
  reload: 1.4,
  // Flop Slap: the whole soft body swings round; anything it lands on feels heavy
  attack: { kind: 'melee', arcDeg: 85, range: 172, dmg: 19, knockback: 45, status: 'heavy', statusSec: 1.5, fx: 'flop-slap' },
  // Rock Nap: tucks under a flat rock and simply is not there for 1.2 s
  special: { kind: 'buff', dmgMul: 0, speedMul: 0, sec: 1.2, cd: 9, fx: 'rock-nap' },
  // Big Nap Quake: rolls over in his sleep and the whole dock jumps
  ult: { kind: 'aoe', at: 'self', radius: 250, delay: 0.5, dmg: 30, push: 100, status: 'heavy', statusSec: 2, fx: 'nap-quake' },
  ultCharge: 150,
};
