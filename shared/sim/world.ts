import { TICK_HZ, WORLD_W, WORLD_H } from '../constants.ts';
import { OBSTACLES, SPAWNS } from '../arena/docks.ts';
import type { SimEvent, SnapMsg, SnapPlayer } from '../protocol.ts';
import { pushOutRect, resolveWalls, separate } from './collide.ts';
import * as C from './combat.ts';
import type { Projectile } from './combat.ts';

export const BASE_SPEED = 240;
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
  fighter: string;
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
  down: boolean;
  respawn: number;
  shield: number;
  kos: number;
  deaths: number;
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
  events: SimEvent[] = [];
  private nextProj = 1;

  addPlayer(id: number, name: string, fighter = 'default'): SimPlayer {
    const s = SPAWNS[(id - 1) % SPAWNS.length];
    const p: SimPlayer = {
      id, name, fighter, x: s.x, y: s.y, r: PLAYER_RADIUS,
      hp: C.MAX_HP, mhp: C.MAX_HP, speedMul: 1, aim: 0, ack: 0, input: null,
      ammo: C.MAX_AMMO, reload: 0, fireCd: 0, fireLatch: false, down: false, respawn: 0,
      shield: C.SHIELD_SEC, kos: 0, deaths: 0,
    };
    this.players.set(id, p);
    this.events.push({ k: 'spawn', id });
    return p;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
  }

  setInput(id: number, input: SimInput): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.input && input.seq < p.input.seq) return;
    if (input.atk && !p.input?.atk) p.fireLatch = true;
    p.input = input;
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
      p.shield = Math.max(0, p.shield - dt);
      p.fireCd = Math.max(0, p.fireCd - dt);
      if (i) {
        stepMove(p, i.mx, i.my, BASE_SPEED * p.speedMul, dt);
        if (Number.isFinite(i.ax) && Number.isFinite(i.ay) && (i.ax !== 0 || i.ay !== 0)) p.aim = Math.atan2(i.ay, i.ax);
        p.ack = i.seq;
      }
      this.reloadStep(p, dt);
      if ((p.fireLatch || i?.atk) && p.ammo > 0 && p.fireCd <= 0) this.fire(p);
      p.fireLatch = false;
    }
    const alive = list.filter((p) => !p.down);
    separate(alive);
    for (const p of alive) resolveWalls(p, OBSTACLES);
    this.stepProjectiles(dt);
  }

  private reloadStep(p: SimPlayer, dt: number): void {
    if (p.ammo >= C.MAX_AMMO) { p.reload = 0; return; }
    p.reload += dt;
    if (p.reload >= C.RELOAD_SEC) { p.ammo++; p.reload = 0; }
  }

  private fire(p: SimPlayer): void {
    p.ammo--;
    p.fireCd = C.FIRE_GAP_SEC;
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    const x = p.x + dx * p.r;
    const y = p.y + dy * p.r;
    this.projs.push({
      id: this.nextProj++, owner: p.id, x, y, vx: dx * C.PROJ_SPEED, vy: dy * C.PROJ_SPEED,
      left: C.PROJ_RANGE, dmg: C.PROJ_DMG, r: C.PROJ_RADIUS,
    });
    this.events.push({ k: 'shot', id: p.id, x: Math.round(x), y: Math.round(y), a: Math.round((p.aim * 180) / Math.PI) });
  }

  private stepProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projs) {
      const dist = Math.min(pr.left, Math.hypot(pr.vx, pr.vy) * dt);
      const n = Math.max(1, Math.ceil(dist / 15));
      const sx = (pr.vx / Math.hypot(pr.vx, pr.vy)) * (dist / n);
      const sy = (pr.vy / Math.hypot(pr.vx, pr.vy)) * (dist / n);
      let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        pr.x += sx;
        pr.y += sy;
        const b = { x: pr.x, y: pr.y, r: pr.r };
        if (pr.x < 0 || pr.y < 0 || pr.x > WORLD_W || pr.y > WORLD_H) { dead = true; break; }
        for (const w of OBSTACLES) if (pushOutRect({ ...b }, w)) { dead = true; break; }
        if (dead) break;
        for (const v of this.players.values()) {
          if (v.id === pr.owner || v.down) continue;
          if (Math.hypot(v.x - pr.x, v.y - pr.y) < v.r + pr.r) {
            dead = true;
            this.damage(pr.owner, v, pr.dmg, pr.x, pr.y);
            break;
          }
        }
      }
      pr.left -= dist;
      if (!dead && pr.left > 0) keep.push(pr);
    }
    this.projs = keep;
  }

  private damage(attacker: number, v: SimPlayer, dmg: number, x: number, y: number): void {
    if (v.shield > 0 || v.down) return;
    v.hp = Math.max(0, v.hp - dmg);
    this.events.push({ k: 'hit', a: attacker, v: v.id, dmg, x: Math.round(x), y: Math.round(y) });
    if (v.hp > 0) return;
    v.down = true;
    v.respawn = C.RESPAWN_SEC;
    v.deaths++;
    const a = this.players.get(attacker);
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

  private respawnPlayer(p: SimPlayer): void {
    const s = this.spawnFor(p);
    p.x = s.x; p.y = s.y;
    p.hp = p.mhp;
    p.down = false;
    p.ammo = C.MAX_AMMO;
    p.reload = 0;
    p.fireCd = 0;
    p.shield = C.SHIELD_SEC;
    this.events.push({ k: 'spawn', id: p.id });
  }

  /** Debug ops (server gates these behind ALLOW_DEBUG). */
  debugTeleport(id: number, x: number, y: number): void {
    const p = this.players.get(id);
    if (p && Number.isFinite(x) && Number.isFinite(y)) { p.x = x; p.y = y; resolveWalls(p, OBSTACLES); }
  }

  debugHp(id: number, hp: number): void {
    const p = this.players.get(id);
    if (p && Number.isFinite(hp)) p.hp = Math.max(1, Math.min(p.mhp, hp));
  }

  clearEvents(): void {
    this.events = [];
  }

  snapshotFor(viewerId: number): SnapMsg {
    const players: SnapPlayer[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, mhp: p.mhp,
        f: p.fighter, n: p.name, st: 0, a: Math.round((p.aim * 180) / Math.PI),
        am: p.ammo, dn: p.down ? 1 : 0, sh: p.shield > 0 ? 1 : 0, k: p.kos, d: p.deaths,
      });
    }
    return { t: 'snap', tick: this.tick, ts: Date.now(), ack: this.players.get(viewerId)?.ack ?? 0, players, projs: this.projs.map((q) => ({ id: q.id, x: Math.round(q.x), y: Math.round(q.y), o: q.owner })), ev: this.events };
  }
}
