import type { Rect } from '../arena/docks.ts';
import { WORLD_W, WORLD_H } from '../constants.ts';
import { pushOutRect } from './collide.ts';
import { abilityReach } from './abilities.ts';
import { canSee } from './visibility.ts';
import { sameTeam } from './teams.ts';
import { SPOT } from './treasure.ts';
import { edgeHeading } from './showdown.ts';
import type { SimInput, SimPlayer, World } from './world.ts';

export type BotDifficulty = 'easy' | 'normal' | 'sharky';
export const BOT_LEVELS: readonly BotDifficulty[] = ['easy', 'normal', 'sharky'];

/** T99: lobby bot level — anything unknown falls back to normal */
export function sanitizeBotLevel(raw: unknown): BotDifficulty {
  return BOT_LEVELS.find((l) => l === raw) ?? 'normal';
}

export const BOT_PARAMS: Record<BotDifficulty, { errDeg: number; react: number }> = {
  easy: { errDeg: 18, react: 0.25 },
  normal: { errDeg: 9, react: 0.15 },
  sharky: { errDeg: 3, react: 0.08 },
};
const PREF_RANGE = 380;
/** Melee kits must walk into their own reach; a ranged bot keeps this much of its shot range. */
const prefRangeFor = (kind: string, reach: number): number =>
  kind === 'projectile' ? Math.min(PREF_RANGE, reach * 0.8) : Math.max(110, reach * 0.75);
const SEE_RANGE = 1100;
const FLEE_FRAC = 0.3;
/** Purrl (backlog #12): a bot below this share of its HP walks to the snail when it is this close. */
const SNAIL_HURT_FRAC = 0.6;
const SNAIL_RANGE = 480;
/** Bots head for a chest when no fight is closer than this. */
const LOOT_RANGE = 520;
const RAD = Math.PI / 180;

export type BotState = 'wander' | 'chase' | 'kite' | 'flee' | 'loot' | 'carry' | 'collect' | 'escort' | 'ring' | 'snail';

function blocked(x: number, y: number, r: number, solids: Rect[]): boolean {
  if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
  for (const o of solids) if (pushOutRect({ x, y, r }, o)) return true;
  return false;
}

/** Whisker steering: rotate the desired heading until the rays ahead are clear of `solids` (the arena's scenery). */
export function steer(me: SimPlayer, ang: number, solids: Rect[]): number {
  const len = me.r + 70;
  const clear = (a: number) => {
    for (const f of [0.5, 1]) if (blocked(me.x + Math.cos(a) * len * f, me.y + Math.sin(a) * len * f, me.r * 0.8, solids)) return false;
    return true;
  };
  for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) if (clear(ang + off)) return ang + off;
  return ang;
}

export class BotBrain {
  state: BotState = 'wander';
  private seq = 0;
  /** Shortest way back onto dry land at high tide, or null when every direction ends in water. */
  private leaveWater(world: World, me: SimPlayer): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (let d = 40; d <= 320; d += 40) {
        if (world.inWaterAt(me.x + Math.cos(a) * d, me.y + Math.sin(a) * d)) continue;
        if (d < bestD) { bestD = d; best = a; }
        break;
      }
    }
    return best;
  }

  private seen: { x: number; y: number; id: number } | null = null;
  private vel = { x: 0, y: 0 };
  private reactT = 0;
  private wanderT = 0;
  private wanderAng = 0;
  private strafeDir: 1 | -1 = 1;
  private strafeT = 0;
  private err = 0;
  private errT = 0;
  /** lobby / ☰-menu level (backlog #14); `setDifficulty` swaps it mid-round */
  difficulty: BotDifficulty;
  private get prm(): { errDeg: number; react: number } {
    return BOT_PARAMS[this.difficulty];
  }
  /** randomness source: `Math.random` in play, a seeded PRNG in the balance harness */
  private readonly rng: () => number;

  constructor(public id: number, difficulty: BotDifficulty = 'normal', rng: () => number = Math.random) {
    this.difficulty = difficulty;
    this.rng = rng;
    this.wanderAng = rng() * Math.PI * 2;
    this.strafeDir = rng() < 0.5 ? 1 : -1;
  }

  /** Backlog #14: the host changes the level; bots already in the room switch on their next think. */
  setDifficulty(difficulty: BotDifficulty): void {
    this.difficulty = difficulty;
  }

  private perceive(world: World, me: SimPlayer, dt: number): void {
    this.reactT -= dt;
    const cur = this.seen ? world.players.get(this.seen.id) : undefined;
    if (this.reactT > 0 && cur && !cur.down && canSee(me, cur) && !sameTeam(me, cur)) return;
    this.reactT = this.prm.react;
    let best: SimPlayer | null = null;
    let bd = SEE_RANGE;
    for (const o of world.players.values()) {
      if (o.id === me.id || o.down) continue;
      if (sameTeam(me, o)) continue; // teammates are never targets (T26)
      if (!canSee(me, o)) continue; // kelp hides targets from bots too
      // Treasure Tide (T27): hunt whoever is holding the loot, even past a closer brawler
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      const score = world.mode === 'treasure' && o.carry > 0 ? d * 0.6 : d;
      if (score < bd) { bd = score; best = o; }
    }
    if (!best) { this.seen = null; return; }
    if (this.seen && this.seen.id === best.id) {
      this.vel = { x: (best.x - this.seen.x) / this.prm.react, y: (best.y - this.seen.y) / this.prm.react };
    } else this.vel = { x: 0, y: 0 };
    this.seen = { x: best.x, y: best.y, id: best.id };
  }

  /** Nearest living teammate inside `range` (a bot regroups when there is nothing to fight). */
  private nearestAlly(world: World, me: SimPlayer, range: number, loaded = false): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bd = range;
    for (const o of world.players.values()) {
      if (o.id === me.id || o.down || !sameTeam(me, o)) continue;
      if (loaded && o.carry <= 0) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /**
   * Treasure Tide roles (T27): a carrier runs for cover with the loot, an empty-handed bot grabs the
   * nearest floating doubloon, and with nothing to grab it escorts the crew's carrier.
   */
  private treasureGoal(
    world: World, me: SimPlayer, foe: { x: number; y: number } | null, shotRange: number,
  ): { heading: number; move: number; aim: number; fire: boolean; state: BotState; dist: number } | null {
    const foeDist = foe ? Math.hypot(foe.x - me.x, foe.y - me.y) : Infinity;
    const toFoe = foe ? Math.atan2(foe.y - me.y, foe.x - me.x) : me.aim;
    const shoot = !!foe && me.ammo > 0 && foeDist < shotRange * 0.9;
    if (me.carry > 0) {
      // run the pile away from the enemy: home is the spawn that is farthest from them
      const spawns = world.arena.spawns;
      let far = spawns[0];
      let fd = -1;
      for (const s of spawns) {
        const d = foe ? Math.hypot(s.x - foe.x, s.y - foe.y) : Math.hypot(s.x - SPOT.x, s.y - SPOT.y);
        if (d > fd) { fd = d; far = s; }
      }
      return {
        heading: Math.atan2(far.y - me.y, far.x - me.x), move: 1,
        aim: foeDist < shotRange ? toFoe : me.aim, fire: shoot, state: 'carry', dist: foeDist,
      };
    }
    // grab the nearest doubloon on the water (the sunken chest drops them in the shallows)
    let coin: { x: number; y: number } | null = null;
    let cd = LOOT_RANGE * 1.6;
    for (const pk of world.picks) {
      if (pk.kind !== 'gold') continue;
      const d = Math.hypot(pk.x - me.x, pk.y - me.y);
      if (d < cd) { cd = d; coin = pk; }
    }
    if (coin) {
      const heading = Math.atan2(coin.y - me.y, coin.x - me.x);
      return { heading, move: 1, aim: shoot ? toFoe : heading, fire: shoot, state: 'collect', dist: foeDist };
    }
    // nothing to grab: stay with whoever is carrying so the pile survives the trip
    const carrier = this.nearestAlly(world, me, SEE_RANGE, true);
    if (carrier) {
      const d = Math.hypot(carrier.x - me.x, carrier.y - me.y);
      return {
        heading: Math.atan2(carrier.y - me.y, carrier.x - me.x), move: d > 160 ? 0.8 : 0,
        aim: shoot ? toFoe : me.aim, fire: shoot, state: 'escort', dist: foeDist,
      };
    }
    return null;
  }

  think(world: World, dt: number): SimInput {
    const me = world.players.get(this.id);
    const out: SimInput = { seq: ++this.seq, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false };
    if (!me || me.down) return out;

    this.perceive(world, me, dt);
    this.errT -= dt;
    if (this.errT <= 0) { this.errT = 0.4; this.err = (this.rng() * 2 - 1) * this.prm.errDeg * RAD; }
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.6 + this.rng() * 1.2; this.strafeDir = this.rng() < 0.5 ? 1 : -1; }

    const t = this.seen;
    let heading: number;
    let move = 1;
    let aim = me.aim;
    let fire = false;
    let dist = Infinity;
    let looting = false;
    const atk = me.def.attack;
    const shotRange = atk.kind === 'projectile' ? atk.range : abilityReach(atk);
    const shotSpeed = atk.kind === 'projectile' ? atk.speed : 900;
    // a melee kit that holds the ranged stand-off never swings: prefer to fight inside its own reach
    const prefRange = prefRangeFor(atk.kind, shotRange);

    // Treasure Tide (T27): carrier / collector / escort beats plain brawling
    const role = world.mode === 'treasure' ? this.treasureGoal(world, me, t, shotRange) : null;
    if (role) {
      this.state = role.state;
      heading = role.heading;
      move = role.move;
      aim = role.aim;
      fire = role.fire;
      dist = role.dist;
      // chasing a doubloon into the shallows is the point of the mode, so no water detour there
      looting = role.state === 'collect';
    } else if (!t) {
      this.state = 'wander';
      // nothing to fight: regroup with the crew instead of drifting alone (T26)
      const ally = this.nearestAlly(world, me, SEE_RANGE);
      if (ally) {
        heading = Math.atan2(ally.y - me.y, ally.x - me.x);
        move = Math.hypot(ally.x - me.x, ally.y - me.y) > 140 ? 0.8 : 0;
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 1 + this.rng() * 2; this.wanderAng = this.rng() * Math.PI * 2; }
        heading = this.wanderAng;
        move = 0.6;
      }
    } else {
      const dx = t.x - me.x;
      const dy = t.y - me.y;
      dist = Math.hypot(dx, dy);
      const to = Math.atan2(dy, dx);
      if (me.hp < me.mhp * FLEE_FRAC) {
        this.state = 'flee';
        const spawns = world.arena.spawns;
        let far = spawns[0];
        let fd = -1;
        for (const s of spawns) {
          const d = Math.hypot(s.x - t.x, s.y - t.y);
          if (d > fd) { fd = d; far = s; }
        }
        heading = Math.atan2(far.y - me.y, far.x - me.x);
        if (Math.hypot(far.x - me.x, far.y - me.y) < 60) move = 0;
        aim = to;
        fire = me.ammo > 0 && dist < shotRange * 0.8;
      } else {
        const lead = dist / shotSpeed;
        aim = Math.atan2(dy + this.vel.y * lead, dx + this.vel.x * lead) + this.err;
        fire = me.ammo > 0 && dist < shotRange * 0.9;
        if (dist > prefRange * 1.2) {
          this.state = 'chase';
          heading = to;
        } else {
          this.state = 'kite';
          // strafe around the target; back off when too close
          heading = dist < prefRange * 0.7 ? to + Math.PI + 0.5 * this.strafeDir : to + (Math.PI / 2) * this.strafeDir;
        }
      }
    }

    // low-tide treasure: with no fight close by, go crack a chest open
    if (!role && world.chests.length && dist > LOOT_RANGE) {
      let chest = world.chests[0];
      let bd = Infinity;
      for (const c of world.chests) {
        const d = Math.hypot(c.x - me.x, c.y - me.y);
        if (d < bd) { bd = d; chest = c; }
      }
      if (chest) {
        this.state = 'loot';
        looting = true;
        heading = Math.atan2(chest.y - me.y, chest.x - me.x);
        move = 1;
        aim = heading;
        fire = me.ammo > 0 && bd < shotRange * 0.8;
        dist = bd;
      }
    }

    // Purrl (backlog #12): hurt, no enemy in sight, snail in reach — walk over for the once-per-life heal
    const snailDist = Math.hypot(world.purrl.x - me.x, world.purrl.y - me.y);
    if (!role && !looting && !me.purrlFed && me.hp < me.mhp * SNAIL_HURT_FRAC && snailDist < SNAIL_RANGE
      && this.state === 'wander') {
      this.state = 'snail';
      heading = Math.atan2(world.purrl.y - me.y, world.purrl.x - me.x);
      move = 1;
    }

    // Showdown (backlog #6): the closing ring beats every other goal — turn back before the edge hurts
    const back = world.mode === 'showdown' ? edgeHeading(me.x, me.y, world.roundT) : null;
    if (back !== null) { this.state = 'ring'; heading = back; move = 1; }
    if (move > 0) heading = steer(me, heading, world.arena.obstacles);
    // rising tide: the flood is slow and soaks you — leave it, and do not walk into it (chest runs are exempt)
    if (!looting && world.tide.level > 0.5) {
      if (world.inWaterAt(me.x, me.y)) {
        const out = this.leaveWater(world, me);
        if (out !== null) { heading = out; move = 1; }
      } else {
        const look = me.r + 60;
        const wet = (a: number) => world.inWaterAt(me.x + Math.cos(a) * look, me.y + Math.sin(a) * look);
        if (wet(heading)) {
          for (const off of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
            if (!wet(heading + off)) { heading += off; break; }
          }
        }
      }
    }
    out.mx = Math.cos(heading) * move;
    out.my = Math.sin(heading) * move;
    out.ax = Math.cos(aim);
    out.ay = Math.sin(aim);
    out.atk = fire;
    // special when the target is inside its reach and the cooldown is ready, ult as soon as it is charged
    // self-targeted heals (Tea Break, Field Surgery) need no enemy in reach: press them when hurt
    const spc = me.def.special;
    const selfHeal = spc.kind === 'aoe' && spc.at === 'self'
      && ((spc.selfHeal ?? 0) > 0 || (spc.allyHeal ?? 0) > 0);
    out.spc = !looting && me.spcCd <= 0 && (selfHeal ? me.hp < me.mhp * 0.75 : !!t && dist <= abilityReach(spc));
    out.ult = !!t && !looting && me.uc >= me.def.ultCharge && dist <= abilityReach(me.def.ult) + 120;
    return out;
  }
}
