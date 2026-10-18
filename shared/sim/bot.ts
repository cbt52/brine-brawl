import { OBSTACLES, SPAWNS } from '../arena/docks.ts';
import { WORLD_W, WORLD_H } from '../constants.ts';
import { pushOutRect } from './collide.ts';
import { abilityReach } from './abilities.ts';
import { canSee } from './visibility.ts';
import type { SimInput, SimPlayer, World } from './world.ts';

export type BotDifficulty = 'easy' | 'normal';

const PARAMS = {
  easy: { errDeg: 18, react: 0.25 },
  normal: { errDeg: 9, react: 0.15 },
};
const PREF_RANGE = 380;
const SEE_RANGE = 1100;
const FLEE_FRAC = 0.3;
const RAD = Math.PI / 180;

export type BotState = 'wander' | 'chase' | 'kite' | 'flee';

function blocked(x: number, y: number, r: number): boolean {
  if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
  for (const o of OBSTACLES) if (pushOutRect({ x, y, r }, o)) return true;
  return false;
}

/** Whisker steering: rotate the desired heading until the rays ahead are clear. */
function steer(me: SimPlayer, ang: number): number {
  const len = me.r + 70;
  const clear = (a: number) => {
    for (const f of [0.5, 1]) if (blocked(me.x + Math.cos(a) * len * f, me.y + Math.sin(a) * len * f, me.r * 0.8)) return false;
    return true;
  };
  for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) if (clear(ang + off)) return ang + off;
  return ang;
}

export class BotBrain {
  state: BotState = 'wander';
  private seq = 0;
  private seen: { x: number; y: number; id: number } | null = null;
  private vel = { x: 0, y: 0 };
  private reactT = 0;
  private wanderT = 0;
  private wanderAng = Math.random() * Math.PI * 2;
  private strafeDir = Math.random() < 0.5 ? 1 : -1;
  private strafeT = 0;
  private err = 0;
  private errT = 0;
  private readonly prm: { errDeg: number; react: number };

  constructor(public id: number, difficulty: BotDifficulty = 'normal') {
    this.prm = PARAMS[difficulty];
  }

  private perceive(world: World, me: SimPlayer, dt: number): void {
    this.reactT -= dt;
    const cur = this.seen ? world.players.get(this.seen.id) : undefined;
    if (this.reactT > 0 && cur && !cur.down && canSee(me, cur)) return;
    this.reactT = this.prm.react;
    let best: SimPlayer | null = null;
    let bd = SEE_RANGE;
    for (const o of world.players.values()) {
      if (o.id === me.id || o.down) continue;
      if (!canSee(me, o)) continue; // kelp hides targets from bots too
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) { this.seen = null; return; }
    if (this.seen && this.seen.id === best.id) {
      this.vel = { x: (best.x - this.seen.x) / this.prm.react, y: (best.y - this.seen.y) / this.prm.react };
    } else this.vel = { x: 0, y: 0 };
    this.seen = { x: best.x, y: best.y, id: best.id };
  }

  think(world: World, dt: number): SimInput {
    const me = world.players.get(this.id);
    const out: SimInput = { seq: ++this.seq, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false };
    if (!me || me.down) return out;

    this.perceive(world, me, dt);
    this.errT -= dt;
    if (this.errT <= 0) { this.errT = 0.4; this.err = (Math.random() * 2 - 1) * this.prm.errDeg * RAD; }
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafeDir = Math.random() < 0.5 ? 1 : -1; }

    const t = this.seen;
    let heading: number;
    let move = 1;
    let aim = me.aim;
    let fire = false;
    let dist = Infinity;
    const atk = me.def.attack;
    const shotRange = atk.kind === 'projectile' ? atk.range : abilityReach(atk);
    const shotSpeed = atk.kind === 'projectile' ? atk.speed : 900;

    if (!t) {
      this.state = 'wander';
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 1 + Math.random() * 2; this.wanderAng = Math.random() * Math.PI * 2; }
      heading = this.wanderAng;
      move = 0.6;
    } else {
      const dx = t.x - me.x;
      const dy = t.y - me.y;
      dist = Math.hypot(dx, dy);
      const to = Math.atan2(dy, dx);
      if (me.hp < me.mhp * FLEE_FRAC) {
        this.state = 'flee';
        let far = SPAWNS[0];
        let fd = -1;
        for (const s of SPAWNS) {
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
        if (dist > PREF_RANGE * 1.2) {
          this.state = 'chase';
          heading = to;
        } else {
          this.state = 'kite';
          // strafe around the target; back off when too close
          heading = dist < PREF_RANGE * 0.7 ? to + Math.PI + 0.5 * this.strafeDir : to + (Math.PI / 2) * this.strafeDir;
        }
      }
    }

    if (move > 0) heading = steer(me, heading);
    out.mx = Math.cos(heading) * move;
    out.my = Math.sin(heading) * move;
    out.ax = Math.cos(aim);
    out.ay = Math.sin(aim);
    out.atk = fire;
    // special when the target is inside its reach and the cooldown is ready, ult as soon as it is charged
    out.spc = !!t && me.spcCd <= 0 && dist <= abilityReach(me.def.special);
    out.ult = !!t && me.uc >= me.def.ultCharge && dist <= abilityReach(me.def.ult) + 120;
    return out;
  }
}
