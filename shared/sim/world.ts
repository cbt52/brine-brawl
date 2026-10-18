import { TICK_HZ, WORLD_W, WORLD_H } from '../constants.ts';
import { OBSTACLES, SPAWNS } from '../arena/docks.ts';
import type { SimEvent, SnapMsg, SnapPlayer } from '../protocol.ts';
import { getFighter } from '../fighters/index.ts';
import { STATUS_CODE, TRAP_BREAK_DMG, type FighterDef, type StatusKind } from '../fighters/types.ts';
import { pushOutRect, resolveWalls, separate } from './collide.ts';
import * as C from './combat.ts';
import type { Projectile } from './combat.ts';
import { applyStatus, castAbility, stepBurrow, stepDash, stepZones, type BurrowState, type DashState, type Zone } from './abilities.ts';
import { canSee, REVEAL_SEC } from './visibility.ts';

export const BASE_SPEED = 240;
/** default body radius (kits carry their own `radius`) */
export const PLAYER_RADIUS = 32;

export interface SimInput {
  seq: number;
  mx: number;
  my: number;
  ax: number;
  ay: number;
  atk: boolean;
  spc: boolean;
  ult: boolean;
}

export interface SimPlayer {
  id: number;
  name: string;
  /** registry id (`shared/fighters`) */
  fighter: string;
  def: FighterDef;
  x: number;
  y: number;
  r: number;
  hp: number;
  mhp: number;
  speedMul: number;
  /** aim angle in radians */
  aim: number;
  ack: number;
  input: SimInput | null;
  ammo: number;
  reload: number;
  fireCd: number;
  /** a rising attack edge arrived since the last step */
  fireLatch: boolean;
  /** special cooldown remaining (seconds) */
  spcCd: number;
  /** ult charge, in damage points (0 … def.ultCharge) */
  uc: number;
  dash: DashState | null;
  /** underground: untargetable, no input, no movement */
  burrow: BurrowState | null;
  /** temporary speed multiplier from a buff */
  buffMul: number;
  buffLeft: number;
  status: StatusKind | null;
  statusLeft: number;
  /** damage taken while `trapped`; reaching TRAP_BREAK_DMG pops the bubble */
  trapTook: number;
  /** seconds of "just attacked" bush reveal left (see visibility.ts) */
  revealT: number;
  down: boolean;
  respawn: number;
  shield: number;
  kos: number;
  deaths: number;
  /** fighter id picked mid-match; swapped in by the next respawn */
  pendingFighter: string | null;
  bot?: boolean;
}

const clamp1 = (n: number) => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);

/** Apply one movement step to a body; shared with client prediction. */
export function stepMove(p: { x: number; y: number; r: number }, mx: number, my: number, speed: number, dt: number): void {
  mx = clamp1(mx);
  my = clamp1(my);
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  p.x += mx * speed * dt;
  p.y += my * speed * dt;
  resolveWalls(p, OBSTACLES);
}

export class World {
  players = new Map<number, SimPlayer>();
  tick = 0;
  projs: Projectile[] = [];
  zones: Zone[] = [];
  events: SimEvent[] = [];
  private nextProj = 1;

  addPlayer(id: number, name: string, fighter = 'default', bot = false): SimPlayer {
    const s = SPAWNS[(id - 1) % SPAWNS.length];
    const def = getFighter(fighter);
    const p: SimPlayer = {
      id, name, fighter: def.id, def, x: s.x, y: s.y, r: def.radius,
      hp: def.maxHp, mhp: def.maxHp, speedMul: def.speedMul, aim: 0, ack: 0, input: null,
      ammo: def.ammo, reload: 0, fireCd: 0, fireLatch: false, spcCd: 0, uc: 0, dash: null, burrow: null,
      buffMul: 1, buffLeft: 0, status: null, statusLeft: 0, trapTook: 0,
      revealT: 0, down: false, respawn: 0, shield: C.SHIELD_SEC, kos: 0, deaths: 0, pendingFighter: null, bot,
    };
    this.players.set(id, p);
    this.events.push({ k: 'spawn', id });
    return p;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
  }

  /**
   * Pick a different fighter. Swapping kits mid-life would change HP/radius under the player, so the
   * change is parked in `pendingFighter` and applied by the next respawn (`respawnPlayer`).
   * Returns true when a change is queued.
   */
  setFighter(id: number, fighter: string): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    const def = getFighter(fighter);
    if (def.id === p.fighter) { p.pendingFighter = null; return false; }
    p.pendingFighter = def.id;
    return true;
  }

  setInput(id: number, input: SimInput): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.input && input.seq < p.input.seq) return;
    if (input.atk && !p.input?.atk) p.fireLatch = true;
    p.input = input;
  }

  /** Live projectiles and zones share one id source (ids only need to be unique in a snapshot). */
  newProjId(): number {
    return this.nextProj++;
  }

  step(dt = 1 / TICK_HZ): void {
    this.tick++;
    const list = [...this.players.values()];
    for (const p of list) {
      const i = p.input;
      if (p.down) {
        p.respawn -= dt;
        if (p.respawn <= 0) this.respawnPlayer(p);
        continue;
      }
      if (p.shield > 0) p.shield = Math.max(0, p.shield - dt);
      if (p.fireCd > 0) p.fireCd = Math.max(0, p.fireCd - dt);
      if (p.spcCd > 0) p.spcCd = Math.max(0, p.spcCd - dt);
      if (p.revealT > 0) p.revealT = Math.max(0, p.revealT - dt);
      if (p.buffLeft > 0) {
        p.buffLeft -= dt;
        if (p.buffLeft <= 0) { p.buffLeft = 0; p.buffMul = 1; }
      }
      if (p.statusLeft > 0) {
        p.statusLeft -= dt;
        if (p.statusLeft <= 0) { p.statusLeft = 0; p.status = null; p.trapTook = 0; }
      }
      // a bubble trap holds the victim in place; a stun locks input the same way
      const trapped = p.status === 'trapped';
      const disabled = trapped || p.status === 'stun';
      if (disabled) p.dash = null;
      const burrowing = stepBurrow(this, p, dt);
      if (burrowing) { p.fireLatch = false; continue; }
      const dashing = !disabled && stepDash(this, p, dt);
      if (i) {
        if (!dashing && !disabled) {
          const spd = BASE_SPEED * p.speedMul * (p.buffLeft > 0 ? p.buffMul : 1);
          stepMove(p, i.mx, i.my, spd, dt);
        }
        if (!disabled && Number.isFinite(i.ax) && Number.isFinite(i.ay) && (i.ax !== 0 || i.ay !== 0)) p.aim = Math.atan2(i.ay, i.ax);
        p.ack = i.seq;
      }
      this.reloadStep(p, dt);
      if (!disabled && (p.fireLatch || i?.atk) && p.ammo > 0 && p.fireCd <= 0) this.fire(p);
      p.fireLatch = false;
      // specials/ults are hold-to-cast, gated by cooldown / charge (works the same for bots)
      if (!disabled && i?.spc && p.spcCd <= 0 && castAbility(this, p, p.def.special, 'special')) {
        p.spcCd = p.def.special.cd > 0 ? p.def.special.cd : 1;
        p.revealT = REVEAL_SEC;
      }
      if (!disabled && i?.ult && p.uc >= p.def.ultCharge && castAbility(this, p, p.def.ult, 'ult')) {
        p.uc = 0;
        p.revealT = REVEAL_SEC;
      }
    }
    stepZones(this, dt);
    const alive = list.filter((p) => !p.down && !p.burrow);
    separate(alive);
    for (const p of alive) resolveWalls(p, OBSTACLES);
    this.stepProjectiles(dt);
  }

  private reloadStep(p: SimPlayer, dt: number): void {
    if (p.ammo >= p.def.ammo) { p.reload = 0; return; }
    p.reload += dt;
    if (p.reload >= p.def.reload) { p.ammo++; p.reload = 0; }
  }

  private fire(p: SimPlayer): void {
    p.ammo--;
    p.fireCd = C.FIRE_GAP_SEC;
    p.revealT = REVEAL_SEC;
    castAbility(this, p, p.def.attack, 'attack');
    this.events.push({
      k: 'shot', id: p.id,
      x: Math.round(p.x + Math.cos(p.aim) * p.r), y: Math.round(p.y + Math.sin(p.aim) * p.r),
      a: Math.round((p.aim * 180) / Math.PI),
    });
  }

  private stepProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projs) {
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      const dist = Math.min(pr.left, sp * dt);
      const n = Math.max(1, Math.ceil(dist / 15));
      let sx = (pr.vx / sp) * (dist / n);
      let sy = (pr.vy / sp) * (dist / n);
      let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        pr.x += sx;
        pr.y += sy;
        if (pr.x < 0 || pr.y < 0 || pr.x > WORLD_W || pr.y > WORLD_H) { dead = true; break; }
        if (!pr.lob) {
          const b = { x: pr.x, y: pr.y, r: pr.r };
          for (const w of OBSTACLES) {
            const bx = b.x;
            const by = b.y;
            if (!pushOutRect(b, w)) continue;
            pr.x = b.x;
            pr.y = b.y;
            if ((pr.bounces ?? 0) > 0) {
              pr.bounces!--;
              if (Math.abs(b.x - bx) >= Math.abs(b.y - by)) pr.vx = -pr.vx;
              else pr.vy = -pr.vy;
              // steer the rest of this tick's sub-steps the new way
              sx = (pr.vx / sp) * (dist / n);
              sy = (pr.vy / sp) * (dist / n);
            } else dead = true;
            break;
          }
          if (dead) break;
        }
        for (const v of this.players.values()) {
          if (v.id === pr.owner || v.down || v.burrow) continue;
          if (Math.hypot(v.x - pr.x, v.y - pr.y) >= v.r + pr.r) continue;
          if (pr.pierce) {
            pr.hit ??= new Set();
            if (pr.hit.has(v.id)) continue;
            pr.hit.add(v.id);
          } else dead = true;
          this.damage(pr.owner, v, pr.dmg, pr.x, pr.y);
          // a spawn shield absorbs the hit entirely: no status either
          if (pr.status && !v.down && v.shield <= 0) {
            applyStatus(v, pr.status, pr.statusSec ?? 1);
            this.events.push({ k: 'status', v: v.id, s: pr.status, sec: pr.statusSec ?? 1 });
          }
          if (dead) break;
        }
      }
      pr.left -= dist;
      if (!dead && pr.left <= 0) dead = true;
      if (dead && pr.aoeOnEnd) {
        this.zones.push({
          id: this.newProjId(), owner: pr.owner, x: pr.x, y: pr.y, r: pr.aoeOnEnd.radius,
          delay: 0, dur: 0, dmg: pr.aoeOnEnd.dmg, tickDmg: 0, push: 0, pull: 0, tickPull: 0,
          coneDeg: 0, aim: 0, status: null, statusSec: 0, tickT: 0, fired: false,
        });
      }
      if (!dead && pr.left > 0) keep.push(pr);
    }
    this.projs = keep;
  }

  /** Single damage entry point: also feeds the attacker's ult charge. */
  damage(attacker: number, v: SimPlayer, dmg: number, x: number, y: number): void {
    if (v.shield > 0 || v.down || v.burrow) return;
    const dealt = Math.max(0, Math.min(v.hp, dmg));
    v.hp = Math.max(0, v.hp - dmg);
    this.events.push({ k: 'hit', a: attacker, v: v.id, dmg, x: Math.round(x), y: Math.round(y) });
    const a = this.players.get(attacker);
    if (a && a.id !== v.id && dealt > 0) a.uc = Math.min(a.def.ultCharge, a.uc + dealt);
    if (v.status === 'trapped' && v.hp > 0) {
      v.trapTook += dealt;
      if (v.trapTook >= TRAP_BREAK_DMG) {
        v.trapTook = 0;
        v.status = null;
        v.statusLeft = 0;
        this.events.push({ k: 'status', v: v.id, s: 'trapped', sec: 0 });
      }
    }
    if (v.hp > 0) return;
    v.down = true;
    v.respawn = C.RESPAWN_SEC;
    v.deaths++;
    v.dash = null;
    v.burrow = null;
    v.status = null;
    v.statusLeft = 0;
    v.trapTook = 0;
    if (a) a.kos++;
    this.events.push({ k: 'ko', a: attacker, v: v.id });
  }

  /** Spawn point maximizing the distance to the nearest living enemy. */
  private spawnFor(p: SimPlayer): { x: number; y: number } {
    const others = [...this.players.values()].filter((o) => o !== p && !o.down);
    let best = SPAWNS[0];
    let bestD = -1;
    for (const s of SPAWNS) {
      const d = others.length ? Math.min(...others.map((o) => Math.hypot(o.x - s.x, o.y - s.y))) : 0;
      if (d > bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Swap in a fighter picked mid-match (stats, body size and kit change together). */
  private applyPendingFighter(p: SimPlayer): void {
    const id = p.pendingFighter;
    if (!id) return;
    p.pendingFighter = null;
    const def = getFighter(id);
    p.fighter = def.id;
    p.def = def;
    p.r = def.radius;
    p.mhp = def.maxHp;
    p.speedMul = def.speedMul;
    p.uc = Math.min(p.uc, def.ultCharge);
  }

  private respawnPlayer(p: SimPlayer): void {
    this.applyPendingFighter(p);
    const s = this.spawnFor(p);
    p.x = s.x; p.y = s.y;
    p.hp = p.mhp;
    p.down = false;
    p.ammo = p.def.ammo;
    p.reload = 0;
    p.fireCd = 0;
    p.spcCd = 0;
    p.dash = null;
    p.burrow = null;
    p.buffMul = 1;
    p.buffLeft = 0;
    p.status = null;
    p.statusLeft = 0;
    p.trapTook = 0;
    p.shield = C.SHIELD_SEC;
    this.events.push({ k: 'spawn', id: p.id });
  }

  /** Debug ops (server gates these behind ALLOW_DEBUG). */
  debugTeleport(id: number, x: number, y: number): void {
    const p = this.players.get(id);
    if (p && Number.isFinite(x) && Number.isFinite(y)) { p.x = x; p.y = y; resolveWalls(p, OBSTACLES); }
  }

  /** Debug: KO a player without an attacker (tests the respawn path). */
  debugKill(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.shield = 0; // spawn shield would otherwise swallow the KO
    this.damage(-1, p, p.hp + 1, p.x, p.y);
  }

  debugHp(id: number, hp: number): void {
    const p = this.players.get(id);
    if (p && Number.isFinite(hp)) p.hp = Math.max(1, Math.min(p.mhp, hp));
  }

  clearEvents(): void {
    this.events = [];
  }

  /** New round: clear the scoreboard (positions, HP and live projectiles stay as they are). */
  resetScores(): void {
    for (const p of this.players.values()) { p.kos = 0; p.deaths = 0; }
  }

  snapshotFor(viewerId: number): SnapMsg {
    const players: SnapPlayer[] = [];
    const viewer = this.players.get(viewerId);
    for (const p of this.players.values()) {
      // underground players are hidden from everybody but the owner
      if (p.burrow && p.id !== viewerId) continue;
      // kelp hides fighters from far enemies unless they just attacked
      if (viewer && !canSee(viewer, p)) continue;
      players.push({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, mhp: p.mhp,
        f: p.fighter, n: p.name, st: p.status ? STATUS_CODE[p.status] : 0,
        a: Math.round((p.aim * 180) / Math.PI),
        am: p.ammo, dn: p.down ? 1 : 0, sh: p.shield > 0 ? 1 : 0, k: p.kos, d: p.deaths,
        uc: Math.round(Math.max(0, Math.min(1, p.uc / p.def.ultCharge)) * 100),
        cd: Math.round(p.spcCd * 10) / 10,
      });
    }
    return {
      t: 'snap', tick: this.tick, ts: Date.now(), ack: this.players.get(viewerId)?.ack ?? 0, players,
      projs: this.projs.map((q) => ({ id: q.id, x: Math.round(q.x), y: Math.round(q.y), o: q.owner })),
      ev: this.events,
    };
  }
}
