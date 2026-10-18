import type { AbilitySlot, SimEvent } from '../protocol.ts';
import type { AbilityDef, Element, StatusKind } from '../fighters/types.ts';
import { OBSTACLES, type Rect } from '../arena/docks.ts';
import type { Arena } from '../arena/arena.ts';
import { applyElementHit, applyStatus as storeStatus, ELEMENT_OF_STATUS } from './elements.ts';
import { noteAttackHit } from './passives.ts';
import { resolveWalls } from './collide.ts';
import type { Projectile } from './combat.ts';
import { wallFor, wallRects, type Wall } from './walls.ts';
import type { Summon } from './summons.ts';
import { sameTeam } from './teams.ts';
import type { Chest, SimPlayer } from './world.ts';
import { CHEST_RADIUS } from './tide.ts';

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
  tickPull: number;
  /** cone centred on `aim` (degrees); 0 = full circle */
  coneDeg: number;
  aim: number;
  status: StatusKind | null;
  statusSec: number;
  /** HP per ½ s tick healed to the owner while the zone lives (Bonfire) */
  selfHeal: number;
  /** root seconds applied to everything the zone touches (Overgrowth) */
  rootSec: number;
  /** doubloons the zone scatters when it triggers (Register Crush) */
  dropGold: number;
  /** HP per ½ s tick healed to teammates standing inside (Field Surgery, T31) */
  allyHeal: number;
  /** element of the hit; defaults to the status element */
  element?: Element;
  tickT: number;
  fired: boolean;
  /** a cloud that hides like a kelp bush (steam reaction) */
  hides?: boolean;
  /** which slot dropped it: `ult` lands feed Crew Combos (T28) */
  slot?: AbilitySlot;
}

export interface DashState {
  vx: number;
  vy: number;
  left: number;
  dmg: number;
  hit: Set<number>;
  /** stop on the first wall/enemy touched */
  stopOnContact: boolean;
  /** trail zones dropped along the path */
  trail: { radius: number; dmg: number; status: StatusKind | null; statusSec: number; element?: Element } | null;
  trailT: number;
  /** which slot started the dash (`ult` contact feeds Crew Combos, T28) */
  slot?: AbilitySlot;
}

export interface BurrowState {
  left: number;
  tx: number;
  ty: number;
  radius: number;
  dmg: number;
  status: StatusKind | null;
  statusSec: number;
  element?: Element;
  /** which slot fired it (`ult` landings feed Crew Combos, T28) */
  slot?: AbilitySlot;
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
  damage(attacker: number, victim: SimPlayer, dmg: number, x: number, y: number, slot?: AbilitySlot): void;
  /** low-tide treasure (optional: tests may cast without scenery) */
  chests?: readonly Chest[];
  damageChest?(attacker: number, chest: Chest, dmg: number): void;
  /** the layout this round is played on (optional: tests may cast on the docks coral) */
  arena?: Arena;
  /** temporary stone walls (optional: tests may cast without them) */
  walls?: Wall[];
  /** standing decoys and turrets (optional: tests may cast without them) */
  summons?: Summon[];
  /** scatter doubloon pickups (optional: tests may cast without them) */
  dropGold?: (x: number, y: number, n: number) => void;
}

function enemies(h: CastHost, owner: number): SimPlayer[] {
  // no friendly fire (T26): abilities and zones only ever target the other crew
  const me = h.players.get(owner);
  const out: SimPlayer[] = [];
  for (const v of h.players.values()) {
    if (v.id === owner || v.down || v.hp <= 0 || v.burrow) continue;
    if (me && sameTeam(me, v)) continue;
    out.push(v);
  }
  return out;
}

/** The arena's solid scenery (the docks coral when the host has no arena). */
function scenery(h: CastHost): Rect[] {
  return h.arena?.obstacles ?? OBSTACLES;
}

function shove(h: CastHost, v: SimPlayer, ux: number, uy: number, amount: number): void {
  v.x += ux * amount;
  v.y += uy * amount;
  resolveWalls(v, scenery(h));
}

/** Extra options for `hitAll` (cone gating, status on hit). */
interface HitOpts {
  coneDeg?: number;
  aim?: number;
  status?: StatusKind | null;
  statusSec?: number;
  /** element of the hit; defaults to the status element (neutral for pure knockback) */
  element?: Element;
  /** root seconds applied to every victim hit (Overgrowth) */
  rootSec?: number;
  /** which slot dealt the damage (`ult` feeds Crew Combos, T28) */
  slot?: AbilitySlot;
}

/** Element of a hit: explicit override, else the status element, else neutral. */
export function hitElement(element?: Element, status?: StatusKind | null): Element {
  return element ?? (status ? ELEMENT_OF_STATUS[status] : 'neutral');
}

/** Damage (and optional push/pull) everything inside a circle (or cone). */
function hitAll(
  h: CastHost, owner: number, x: number, y: number, radius: number, dmg: number,
  push = 0, pull = 0, o: HitOpts = {},
): void {
  const half = ((o.coneDeg ?? 0) * Math.PI) / 360;
  for (const v of enemies(h, owner)) {
    const dx = v.x - x;
    const dy = v.y - y;
    const d = Math.hypot(dx, dy);
    if (d > radius + v.r) continue;
    if (half > 0 && d > v.r && Math.abs(wrapPi(Math.atan2(dy, dx) - (o.aim ?? 0))) > half) continue;
    if (dmg > 0) h.damage(owner, v, dmg, v.x, v.y, o.slot);
    const ux = d > 1e-6 ? dx / d : 1;
    const uy = d > 1e-6 ? dy / d : 0;
    if (push) shove(h, v, ux, uy, push);
    if (pull) shove(h, v, -ux, -uy, Math.min(pull, Math.max(0, d)));
    if (o.rootSec && !v.down) v.rootLeft = Math.max(v.rootLeft, o.rootSec);
    if (!v.down && v.shield <= 0) {
      const react = applyElementHit(h, owner, v, o.status ?? null, o.statusSec ?? 0, hitElement(o.element, o.status));
      if (react === null && o.status) h.events.push({ k: 'status', v: v.id, s: o.status, sec: o.statusSec ?? 1 });
    }
  }
  // treasure chests take splash damage too (they are scenery, so no reaction/status)
  if (dmg > 0 && h.chests && h.damageChest) {
    for (const c of h.chests) {
      if (c.hp <= 0) continue;
      if (Math.hypot(c.x - x, c.y - y) > radius + CHEST_RADIUS) continue;
      h.damageChest(owner, c, dmg);
    }
  }
}

/** Heal the caster and every teammate inside a circle (Field Surgery, T31). */
function healAllies(h: CastHost, owner: number, x: number, y: number, radius: number, amount: number): void {
  const me = h.players.get(owner);
  for (const v of h.players.values()) {
    if (v.down || v.burrow || v.hp <= 0 || v.hp >= v.mhp) continue;
    if (v.id !== owner && !(me && sameTeam(me, v))) continue;
    if (Math.hypot(v.x - x, v.y - y) > radius + v.r) continue;
    v.hp = Math.min(v.mhp, v.hp + amount);
    h.events.push({ k: 'heal', v: v.id, n: Math.round(amount), x: Math.round(v.x), y: Math.round(v.y) });
  }
}

/** Store a status directly (bubble trap pop, tests). */
const applyStatus = storeStatus;
export { applyStatus };

const TAU = Math.PI * 2;
const wrapPi = (a: number): number => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};

/** Damage / status scaling for one cast (the weaver FLOW passive, T20). */
export interface CastMod {
  /** damage multiplier (1 = normal) */
  dmg: number;
  /** status-duration multiplier (1 = normal) */
  status: number;
}

/** Damage after the caster's FLOW multiplier (T20). */
const dmgOf = (v: number, mod?: CastMod): number => v * (mod?.dmg ?? 1);

/** Cast any ability primitive. Returns false when the def is degenerate (nothing happened). */
export function castAbility(
  h: CastHost,
  p: SimPlayer,
  def: AbilityDef,
  slot: AbilitySlot = 'special',
  mod?: CastMod,
): boolean {
  const ax = Math.cos(p.aim);
  const ay = Math.sin(p.aim);
  // an ability without an explicit element hits with the fighter's own element (types.ts:40-41)
  const defEl = def.element ?? p.def.element;

  switch (def.kind) {
    case 'projectile': {
      const n = Math.max(1, Math.floor(def.count) || 1);
      const spread = (Math.max(0, def.spread) * Math.PI) / 180;
      const dmg = def.dmg * (mod?.dmg ?? 1);
      const statusSec = (def.statusSec ?? 0) * (mod?.status ?? 1);
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? p.aim : p.aim - spread / 2 + (spread * i) / (n - 1);
        h.projs.push({
          id: h.newProjId(), owner: p.id,
          x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r,
          vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed,
          left: def.range, dmg, r: def.radius,
          pierce: !!def.pierce, bounces: Math.max(0, Math.floor(def.bounce ?? 0)),
          lob: !!def.lob, aoeOnEnd: def.aoeOnEnd, homing: !!def.homing, returns: !!def.returns, hit: new Set(),
          status: def.status, statusSec, element: hitElement(defEl, def.status), slot, allyHeal: def.allyHeal,
        });
      }
      break;
    }
    case 'melee': {
      const half = (Math.max(0, def.arcDeg) * Math.PI) / 360;
      const dmg = def.dmg * (mod?.dmg ?? 1);
      const statusSec = (def.statusSec ?? 0) * (mod?.status ?? 1);
      for (const v of enemies(h, p.id)) {
        const dx = v.x - p.x;
        const dy = v.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > def.range + v.r) continue;
        // a target standing on top of the attacker always gets hit
        if (d > v.r && Math.abs(wrapPi(Math.atan2(dy, dx) - p.aim)) > half) continue;
        h.damage(p.id, v, dmg, v.x, v.y, slot);
        if (slot === 'attack' && !v.down) noteAttackHit(p);
        if (def.knockback) shove(h, v, d > 1e-6 ? dx / d : ax, d > 1e-6 ? dy / d : ay, def.knockback);
        if (!v.down && v.shield <= 0) {
          const el = hitElement(defEl, def.status);
          const react = applyElementHit(h, p.id, v, def.status ?? null, statusSec, el);
          if (react === null && def.status) h.events.push({ k: 'status', v: v.id, s: def.status, sec: statusSec || 1 });
        }
      }
      break;
    }
    case 'dash': {
      const dur = Math.max(0.02, def.dur);
      p.dash = {
        vx: (ax * def.dist) / dur, vy: (ay * def.dist) / dur, left: dur, dmg: def.contactDmg ?? 0, hit: new Set(),
        stopOnContact: !!def.stopOnContact,
        trail: def.trailZone
          ? {
            radius: def.trailZone.radius, dmg: def.trailZone.dmg ?? 0,
            status: def.trailZone.status ?? null, statusSec: def.trailZone.statusSec ?? 0,
            element: hitElement(def.element ?? def.trailZone.element ?? p.def.element, def.trailZone.status),
          }
          : null,
        trailT: 0, slot,
      };
      break;
    }
    case 'burrow': {
      p.burrow = {
        left: Math.max(0.05, def.dur),
        tx: p.x + ax * def.range,
        ty: p.y + ay * def.range,
        radius: def.radius,
        dmg: def.dmg,
        status: def.status ?? null,
        statusSec: def.statusSec ?? 0,
        element: hitElement(defEl, def.status), slot,
      };
      p.dash = null;
      break;
    }
    case 'aoe': {
      const n = Math.max(1, Math.floor(def.strikes ?? 1));
      const fan = (Math.max(0, def.strikeSpreadDeg ?? 0) * Math.PI) / 180;
      const reach = def.range ?? 0;
      for (let i = 0; i < n; i++) {
        // one strike lands on the aim point; several fan out around it (Lightning Chart, T31)
        const a = n === 1 ? p.aim : p.aim - fan / 2 + (fan * i) / (n - 1);
        const zx = def.at === 'self' ? p.x : p.x + Math.cos(a) * reach;
        const zy = def.at === 'self' ? p.y : p.y + Math.sin(a) * reach;
        h.zones.push({
          id: h.newProjId(), owner: p.id, x: zx, y: zy, r: def.radius,
          delay: Math.max(0, def.delay), dur: Math.max(0, def.zoneSec ?? 0),
          dmg: dmgOf(def.dmg, mod), tickDmg: dmgOf(def.tickDmg ?? 0, mod), push: def.push ?? 0, pull: def.pull ?? 0,
          tickPull: def.tickPull ?? 0, coneDeg: def.coneDeg ?? 0, aim: p.aim,
          status: def.status ?? null, statusSec: (def.statusSec ?? 0) * (mod?.status ?? 1),
          selfHeal: def.selfHeal ?? 0, rootSec: def.rootSec ?? 0, dropGold: def.dropGold ?? 0,
          allyHeal: def.allyHeal ?? 0,
          element: hitElement(defEl, def.status), slot,
          tickT: 0, fired: false, hides: def.hides || undefined,
        });
      }
      // Smoke Pop: the cloud also carries the caster faster for as long as it stands
      if (def.selfSpeedMul !== undefined) {
        p.buffMul = def.selfSpeedMul;
        p.buffLeft = Math.max(0.1, def.zoneSec ?? 0);
      }
      break;
    }
    case 'summon': {
      const dist = def.dist ?? 70;
      const sx = p.x + ax * dist;
      const sy = p.y + ay * dist;
      h.summons ??= [];
      h.summons.push({
        id: h.newProjId(), owner: p.id, team: p.team, kind: def.type,
        x: sx, y: sy, r: def.radius, hp: def.hp, mhp: def.hp, left: Math.max(0.2, def.sec),
        dmg: def.dmg ?? 0, fireEvery: Math.max(0.2, def.fireEvery ?? 1), fireT: 0.3,
        range: def.range ?? 420, element: hitElement(defEl, def.status ?? null), slot,
        status: def.status ?? null, statusSec: def.statusSec ?? 0,
      });
      break;
    }
    case 'wall': {
      const spot = wallFor(p.x, p.y, p.aim, def);
      h.walls ??= [];
      h.walls.push({
        id: h.newProjId(), owner: p.id, x: spot.x, y: spot.y, w: spot.w, h: spot.h,
        hp: def.hp, mhp: def.hp, left: Math.max(0.2, def.sec),
      });
      break;
    }
    case 'buff': {
      if (def.shield) p.shield = Math.max(p.shield, def.shield);
      if (def.heal) p.hp = Math.min(p.mhp, p.hp + def.heal);
      if (def.speedMul !== undefined) {
        p.buffMul = def.speedMul;
        p.buffLeft = def.sec;
      }
      if (def.dmgMul !== undefined) {
        p.dmgMul = def.dmgMul;
        p.dmgMulLeft = def.sec;
      }
      break;
    }
    case 'status': {
      const sx = def.at === 'self' ? p.x : p.x + ax * (def.range ?? 0);
      const sy = def.at === 'self' ? p.y : p.y + ay * (def.range ?? 0);
      for (const v of enemies(h, p.id)) {
        if (Math.hypot(v.x - sx, v.y - sy) > def.radius + v.r) continue;
        if (def.dmg) h.damage(p.id, v, def.dmg, v.x, v.y, slot);
        if (!v.down) {
          const el = hitElement(defEl, def.status);
          const react = applyElementHit(h, p.id, v, def.status, def.sec, el);
          if (react === null) h.events.push({ k: 'status', v: v.id, s: def.status, sec: def.sec });
        }
      }
      break;
    }
  }

  h.events.push({
    k: 'cast', id: p.id, ab: def.kind,
    x: Math.round(p.x), y: Math.round(p.y), a: Math.round((p.aim * 180) / Math.PI), slot,
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
    case 'burrow': return def.range + def.radius;
    case 'wall': return def.range + def.len / 2;
    case 'buff': return Infinity; // self-targeted: always usable
    case 'summon': return Infinity; // dropped at the caster's feet: always usable
  }
}

/** Advance every zone by one step; `dt` is the fixed tick length. */
export function stepZones(h: CastHost, dt: number): void {
  const keep: Zone[] = [];
  for (const z of h.zones) {
    const opts: HitOpts = {
      coneDeg: z.coneDeg, aim: z.aim, status: z.status, statusSec: z.statusSec,
      element: z.element, rootSec: z.rootSec, slot: z.slot,
    };
    if (!z.fired) {
      z.delay -= dt;
      if (z.delay > 0) { keep.push(z); continue; }
      z.fired = true;
      hitAll(h, z.owner, z.x, z.y, z.r, z.dmg, z.push, z.pull, opts);
      if (z.dropGold > 0) h.dropGold?.(z.x, z.y, z.dropGold);
    }
    if (z.dur > 0) {
      z.tickT += dt;
      while (z.tickT >= ZONE_TICK_SEC) {
        z.tickT -= ZONE_TICK_SEC;
        if (z.tickDmg > 0 || z.tickPull > 0) hitAll(h, z.owner, z.x, z.y, z.r, z.tickDmg, 0, z.tickPull, opts);
        else if (z.status && opts.statusSec) hitAll(h, z.owner, z.x, z.y, z.r, 0, 0, 0, opts);
        // Field Surgery (T31) patches up the caster and every teammate inside
        if (z.allyHeal > 0) healAllies(h, z.owner, z.x, z.y, z.r, z.allyHeal);
        // Bonfire heals its own caster while it burns
        if (z.selfHeal > 0) {
          const owner = h.players.get(z.owner);
          if (owner && !owner.down && owner.hp > 0) owner.hp = Math.min(owner.mhp, owner.hp + z.selfHeal);
        }
      }
      z.dur -= dt;
      if (z.dur > 0) keep.push(z);
    }
  }
  h.zones = keep;
}

/** How often a dash trail drops a new zone (seconds). */
const TRAIL_GAP_SEC = 0.05;

/** Advance an active dash. Returns true when it took over this tick's movement. */
export function stepDash(h: CastHost, p: SimPlayer, dt: number): boolean {
  const d = p.dash;
  if (!d) return false;
  const x0 = p.x;
  const y0 = p.y;
  const wantX = d.vx * dt;
  const wantY = d.vy * dt;
  p.x += wantX;
  p.y += wantY;
  // stone slabs are as solid as the coral: a dash must not cross (or end inside) one
  resolveWalls(p, h.walls?.length ? scenery(h).concat(wallRects(h.walls)) : scenery(h));
  // a wall blocked most of the intended step: a contact dash stops here
  if (d.stopOnContact && Math.hypot(p.x - x0, p.y - y0) < Math.hypot(wantX, wantY) * 0.7) {
    p.dash = null;
    return true;
  }
  if (d.trail) {
    d.trailT -= dt;
    if (d.trailT <= 0) {
      d.trailT = TRAIL_GAP_SEC;
      h.zones.push({
        id: h.newProjId(), owner: p.id, x: p.x, y: p.y, r: d.trail.radius,
        delay: 0, dur: 0, dmg: d.trail.dmg, tickDmg: 0, push: 0, pull: 0, tickPull: 0,
        coneDeg: 0, aim: 0, status: d.trail.status, statusSec: d.trail.statusSec,
        selfHeal: 0, rootSec: 0, dropGold: 0, allyHeal: 0, element: d.trail.element, tickT: 0, fired: false, slot: d.slot,
      });
    }
  }
  for (const v of enemies(h, p.id)) {
    if (d.hit.has(v.id)) continue;
    if (Math.hypot(v.x - p.x, v.y - p.y) < v.r + p.r) {
      d.hit.add(v.id);
      if (d.dmg > 0) h.damage(p.id, v, d.dmg, v.x, v.y, d.slot);
      if (d.stopOnContact) {
        p.dash = null;
        return true;
      }
    }
  }
  d.left -= dt;
  if (d.left <= 0) p.dash = null;
  return true;
}

/**
 * Advance a burrow. Returns true while the player is underground (untargetable, no input).
 * On the landing tick it teleports, blasts and returns false so movement resumes immediately.
 */
export function stepBurrow(h: CastHost, p: SimPlayer, dt: number): boolean {
  const b = p.burrow;
  if (!b) return false;
  b.left -= dt;
  if (b.left > 0) return true;
  p.x = b.tx;
  p.y = b.ty;
  resolveWalls(p, h.walls?.length ? scenery(h).concat(wallRects(h.walls)) : scenery(h));
  p.burrow = null;
  hitAll(h, p.id, p.x, p.y, b.radius, b.dmg, 0, 0, {
    status: b.status, statusSec: b.statusSec, element: b.element, slot: b.slot,
  });
  h.events.push({ k: 'cast', id: p.id, ab: 'burrow', x: Math.round(p.x), y: Math.round(p.y), a: 0 });
  return false;
}
