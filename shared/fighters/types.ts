/**
 * Fighter & ability data. Everything here is plain data — the sim (`shared/sim/abilities.ts`)
 * executes the primitives generically, so a new fighter is normally just a new entry in
 * `shared/fighters/index.ts`. Only when a primitive cannot express an idea, add a custom hook in
 * `shared/fighters/hooks/<id>.ts`.
 */

export type Faction = 'critterkin' | 'weavers' | 'saltwind' | 'bubblebottom';

export type Element = 'neutral' | 'water' | 'fire' | 'volt' | 'earth' | 'leaf' | 'air';

/** `trapped` = stuck inside a bubble: no movement, no attacks, breaks after 25 damage. */
export type StatusKind = 'wet' | 'burn' | 'static' | 'heavy' | 'tangled' | 'stun' | 'trapped';

/** Snapshot bit for a status (`st`); `0` = no status. */
export const STATUS_BIT: Record<StatusKind, number> = {
  wet: 1, burn: 2, static: 4, heavy: 8, tangled: 16, stun: 32, trapped: 64,
};

/** Snapshot mask for a (single) status — bit flags so a second status can be added later. */
export function statusMask(status: StatusKind | null | undefined): number {
  return status ? STATUS_BIT[status] : 0;
}

/** True when the snapshot mask `st` contains `status`. */
export function hasStatus(st: number | undefined, status: StatusKind): boolean {
  return ((st ?? 0) & STATUS_BIT[status]) !== 0;
}

/** Damage needed to pop a bubble trap early. */
export const TRAP_BREAK_DMG = 25;

export type Role = 'allrounder' | 'bruiser' | 'sharpshooter' | 'skirmisher' | 'support';

/** Fields every ability shares. `cd` is the cooldown in seconds (attack uses ammo instead). */
interface AbilityBase {
  /** cosmetic key for the client FX pass (T13) */
  fx?: string;
  cd?: number;
  /** element override; defaults to the status element, else the fighter's element */
  element?: Element;
}

export interface ProjectileAbility extends AbilityBase {
  kind: 'projectile';
  /** number of projectiles per cast */
  count: number;
  /** total spread in degrees across `count` (0 = all on one line) */
  spread: number;
  speed: number;
  range: number;
  dmg: number;
  radius: number;
  /** passes through enemies instead of dying on the first hit */
  pierce?: boolean;
  /** number of wall bounces before dying (0/undefined = none) */
  bounce?: number;
  /** lobbed shot: flies over walls (still stops at the arena border) */
  lob?: boolean;
  /** damage blob when the projectile expires or hits (optionally carrying a status, Pebble Lob) */
  aoeOnEnd?: { radius: number; dmg: number; status?: StatusKind; statusSec?: number };
  /** status applied to every enemy it hits (bubble trap) */
  status?: StatusKind;
  statusSec?: number;
  /** steer toward the nearest enemy in flight (lantern moths) */
  homing?: boolean;
}

export interface MeleeAbility extends AbilityBase {
  kind: 'melee';
  /** full swing arc in degrees, centred on the aim */
  arcDeg: number;
  range: number;
  dmg: number;
  knockback: number;
  /** optional on-hit status (e.g. Water Whip → wet) */
  status?: StatusKind;
  statusSec?: number;
}

export interface DashAbility extends AbilityBase {
  kind: 'dash';
  dist: number;
  /** seconds the dash lasts */
  dur: number;
  /** damage dealt to every enemy touched once */
  contactDmg?: number;
  /** stop the dash on the first wall or enemy it touches (Sling Grab) */
  stopOnContact?: boolean;
  /** cosmetic: leave a trail */
  trail?: boolean;
  /** functional trail: damage/status zones dropped along the dash path */
  trailZone?: { radius: number; dmg?: number; status?: StatusKind; statusSec?: number; element?: Element };
}

export interface AoeAbility extends AbilityBase {
  kind: 'aoe';
  at: 'self' | 'aim';
  /** distance from the caster when `at:'aim'` */
  range?: number;
  radius: number;
  /** seconds until the zone triggers (0 = instant) */
  delay: number;
  dmg: number;
  /** shove targets away (units, instant) */
  push?: number;
  /** drag targets toward the centre (units, instant) */
  pull?: number;
  /** lifetime after the trigger; 0 = one instant hit */
  zoneSec?: number;
  /** damage every 0.5 s while the zone is alive */
  tickDmg?: number;
  /** pull toward the centre every 0.5 s while the zone is alive (Maelstrom) */
  tickPull?: number;
  /** cone centred on the aim (degrees); victims outside it are ignored */
  coneDeg?: number;
  /** HP per ½ s tick healed to the caster while the zone lives (Bonfire) */
  selfHeal?: number;
  /** seconds of "cannot walk" (root) left on victims the zone touches (Overgrowth) */
  rootSec?: number;
  /** status applied to everything the zone touches */
  status?: StatusKind;
  statusSec?: number;
  /** doubloons scattered at the zone centre when it triggers (Register Crush) */
  dropGold?: number;
}

export interface BuffAbility extends AbilityBase {
  kind: 'buff';
  /** extra spawn-shield seconds */
  shield?: number;
  /** HP restored (capped at max HP) */
  heal?: number;
  /** temporary movement multiplier (0 = rooted, Snooze) */
  speedMul?: number;
  /** damage-taken multiplier while the buff runs (0.5 = half damage, Shell Spin) */
  dmgMul?: number;
  /** duration of the buff in seconds */
  sec: number;
}

export interface StatusAbility extends AbilityBase {
  kind: 'status';
  at: 'self' | 'aim';
  range?: number;
  radius: number;
  status: StatusKind;
  /** status duration in seconds */
  sec: number;
  dmg?: number;
}

export interface BurrowAbility extends AbilityBase {
  kind: 'burrow';
  /** seconds underground (untargetable, cannot move or cast) */
  dur: number;
  /** how far toward the aim point the burrow ends */
  range: number;
  /** arrival blast */
  radius: number;
  dmg: number;
  status?: StatusKind;
  statusSec?: number;
}

/** A temporary dynamic obstacle: blocks bodies and shots until its HP or lifetime run out. */
export interface WallAbility extends AbilityBase {
  kind: 'wall';
  /** distance in front of the caster where the slab stands */
  range: number;
  /** length of the slab across the aim */
  len: number;
  /** seconds it stands */
  sec: number;
  /** hit points: shots chew through the stone */
  hp: number;
}

export type AbilityDef =
  | ProjectileAbility
  | MeleeAbility
  | DashAbility
  | AoeAbility
  | BuffAbility
  | StatusAbility
  | BurrowAbility
  | WallAbility;

export interface FighterDef {
  /** registry key, also sent in `join.fighter` */
  id: string;
  name: string;
  faction: Faction;
  element: Element;
  role: Role;
  /** one-liner for the select screen */
  blurb: string;
  /** display names for the three moves (select screen shows them above the generated one-liners) */
  moves?: { attack: string; special: string; ult: string };
  radius: number;
  maxHp: number;
  /** movement multiplier on BASE_SPEED (0.85–1.25) */
  speedMul: number;
  /** attack ammo and the seconds to reload one */
  ammo: number;
  reload: number;
  attack: AbilityDef;
  /** `cd` is mandatory: a special without a cooldown would re-cast every tick */
  special: AbilityDef & { cd: number };
  ult: AbilityDef;
  /** damage dealt needed to charge the ult */
  ultCharge: number;
}
