import type { SimEvent } from '../protocol.ts';
import type { AbilityDef, StatusKind } from '../fighters/types.ts';
import { OBSTACLES } from '../arena/docks.ts';
import { resolveWalls } from './collide.ts';
import type { Projectile } from './combat.ts';
import type { SimPlayer } from './world.ts';

/** Damage zones tick at this rate while they live. */
export const ZONE_TICK_SEC = 0.5;

/** A persistent (or delayed) area effect. */
export interface Zone {
  id: number;
  owner: number;
  x: number;
  y: number;
  r: number;
  /** seconds until it triggers; 0 = on the next step */
  delay: number;
  /** lifetime after the trigger; 0 = one instant hit */
  dur: number;
  dmg: number;
  tickDmg: number;
  push: number;
  pull: number;
  tickT: number;
  fired: boolean;
}

export interface DashState {
  vx: number;
  vy: number;
  left: number;
  dmg: number;
  hit: Set<number>;
}

/**
 * What an ability needs from the sim. `World` satisfies it structurally, so this module never has
 * to import the world at runtime (no cycle: world → abilities only).
 */
export interface CastHost {
  players: Map<number, SimPlayer>;
  projs: Projectile[];
  zones: Zone[];
  events: SimEvent[];
  newProjId(): number;
  damage(attacker: number, victim: SimPlayer, dmg: number, x: number, y: number): void;
}

function enemies(h: CastHost, owner: number): SimPlayer[] {
  const out: SimPlayer[] = [];
  for (const v of h.players.values()) if (v.id !== owner && !v.down && v.hp > 0) out.push(v);
  return out;
}

function shove(v: SimPlayer, ux: number, uy: number, amount: number): void {
  v.x += ux * amount;
  v.y += uy * amount;
  resolveWalls(v, OBSTACLES);
}

/** Damage (and optional push/pull) everything inside a circle. */
function hitAll(h: CastHost, owner: number, x: number, y: number, radius: number, dmg: number, push = 0, pull = 0): void {
  for (const v of enemies(h, owner)) {
    const dx = v.x - x;
    const dy = v.y - y;
    const d = Math.hypot(dx, dy);
    if (d > radius + v.r) continue;
    if (dmg > 0) h.damage(owner, v, dmg, v.x, v.y);
    const ux = d > 1e-6 ? dx / d : 1;
    const uy = d > 1e-6 ? dy / d : 0;
    if (push) shove(v, ux, uy, push);
    if (pull) shove(v, -ux, -uy, Math.min(pull, Math.max(0, d)));
  }
}

function applyStatus(p: SimPlayer, status: StatusKind, sec: number): void {
  p.status = status;
  p.statusLeft = Math.max(p.statusLeft, sec);
}

const TAU = Math.PI * 2;
const wrapPi = (a: number): number => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};

/** Cast any ability primitive. Returns false when the def is degenerate (nothing happened). */
export function castAbility(h: CastHost, p: SimPlayer, def: AbilityDef): boolean {
  const ax = Math.cos(p.aim);
  const ay = Math.sin(p.aim);

  switch (def.kind) {
    case 'projectile': {
      const n = Math.max(1, Math.floor(def.count) || 1);
      const spread = (Math.max(0, def.spread) * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? p.aim : p.aim - spread / 2 + (spread * i) / (n - 1);
        h.projs.push({
          id: h.newProjId(), owner: p.id,
          x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r,
          vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed,
          left: def.range, dmg: def.dmg, r: def.radius,
          pierce: !!def.pierce, bounces: Math.max(0, Math.floor(def.bounce ?? 0)),
          lob: !!def.lob, aoeOnEnd: def.aoeOnEnd, hit: new Set(),
        });
      }
      break;
    }
    case 'melee': {
      const half = (Math.max(0, def.arcDeg) * Math.PI) / 360;
      for (const v of enemies(h, p.id)) {
        const dx = v.x - p.x;
        const dy = v.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > def.range + v.r) continue;
        // a target standing on top of the attacker always gets hit
        if (d > v.r && Math.abs(wrapPi(Math.atan2(dy, dx) - p.aim)) > half) continue;
        h.damage(p.id, v, def.dmg, v.x, v.y);
        if (def.knockback) shove(v, d > 1e-6 ? dx / d : ax, d > 1e-6 ? dy / d : ay, def.knockback);
      }
      break;
    }
    case 'dash': {
      const dur = Math.max(0.02, def.dur);
      p.dash = { vx: (ax * def.dist) / dur, vy: (ay * def.dist) / dur, left: dur, dmg: def.contactDmg ?? 0, hit: new Set() };
      break;
    }
    case 'aoe': {
      const zx = def.at === 'self' ? p.x : p.x + ax * (def.range ?? 0);
      const zy = def.at === 'self' ? p.y : p.y + ay * (def.range ?? 0);
      h.zones.push({
        id: h.newProjId(), owner: p.id, x: zx, y: zy, r: def.radius,
        delay: Math.max(0, def.delay), dur: Math.max(0, def.zoneSec ?? 0),
        dmg: def.dmg, tickDmg: def.tickDmg ?? 0, push: def.push ?? 0, pull: def.pull ?? 0,
        tickT: 0, fired: false,
      });
      break;
    }
    case 'buff': {
      if (def.shield) p.shield = Math.max(p.shield, def.shield);
      if (def.heal) p.hp = Math.min(p.mhp, p.hp + def.heal);
      if (def.speedMul) {
        p.buffMul = def.speedMul;
        p.buffLeft = def.sec;
      }
      break;
    }
    case 'status': {
      const sx = def.at === 'self' ? p.x : p.x + ax * (def.range ?? 0);
      const sy = def.at === 'self' ? p.y : p.y + ay * (def.range ?? 0);
      for (const v of enemies(h, p.id)) {
        if (Math.hypot(v.x - sx, v.y - sy) > def.radius + v.r) continue;
        if (def.dmg) h.damage(p.id, v, def.dmg, v.x, v.y);
        if (!v.down) {
          applyStatus(v, def.status, def.sec);
          h.events.push({ k: 'status', v: v.id, s: def.status, sec: def.sec });
        }
      }
      break;
    }
  }

  h.events.push({
    k: 'cast', id: p.id, ab: def.kind,
    x: Math.round(p.x), y: Math.round(p.y), a: Math.round((p.aim * 180) / Math.PI),
  });
  return true;
}

/** How far an ability can reach (bots use this to decide when to press the button). */
export function abilityReach(def: AbilityDef): number {
  switch (def.kind) {
    case 'projectile': return def.range * 0.9;
    case 'melee': return def.range;
    case 'dash': return def.dist;
    case 'aoe': return (def.at === 'self' ? 0 : def.range ?? 0) + def.radius;
    case 'status': return (def.at === 'self' ? 0 : def.range ?? 0) + def.radius;
    case 'buff': return Infinity; // self-targeted: always usable
  }
}

/** Advance every zone by one step; `dt` is the fixed tick length. */
export function stepZones(h: CastHost, dt: number): void {
  const keep: Zone[] = [];
  for (const z of h.zones) {
    if (!z.fired) {
      z.delay -= dt;
      if (z.delay > 0) { keep.push(z); continue; }
      z.fired = true;
      hitAll(h, z.owner, z.x, z.y, z.r, z.dmg, z.push, z.pull);
    }
    if (z.dur > 0) {
      z.tickT += dt;
      while (z.tickT >= ZONE_TICK_SEC) {
        z.tickT -= ZONE_TICK_SEC;
        if (z.tickDmg > 0) hitAll(h, z.owner, z.x, z.y, z.r, z.tickDmg);
      }
      z.dur -= dt;
      if (z.dur > 0) keep.push(z);
    }
  }
  h.zones = keep;
}

/** Advance an active dash. Returns true when it took over this tick's movement. */
export function stepDash(h: CastHost, p: SimPlayer, dt: number): boolean {
  const d = p.dash;
  if (!d) return false;
  p.x += d.vx * dt;
  p.y += d.vy * dt;
  resolveWalls(p, OBSTACLES);
  if (d.dmg > 0) {
    for (const v of enemies(h, p.id)) {
      if (d.hit.has(v.id)) continue;
      if (Math.hypot(v.x - p.x, v.y - p.y) < v.r + p.r) {
        d.hit.add(v.id);
        h.damage(p.id, v, d.dmg, v.x, v.y);
      }
    }
  }
  d.left -= dt;
  if (d.left <= 0) p.dash = null;
  return true;
}
