import { TICK_HZ, WORLD_W, WORLD_H } from '../constants.ts';
import { OBSTACLES, SPAWNS } from '../arena/docks.ts';
import type { PickupKind, SimEvent, SnapMsg, SnapPlayer } from '../protocol.ts';
import { getFighter } from '../fighters/index.ts';
import { statusMask, TRAP_BREAK_DMG, type FighterDef, type StatusKind } from '../fighters/types.ts';
import { pushOutRect, resolveWalls, separate } from './collide.ts';
import * as C from './combat.ts';
import type { Projectile } from './combat.ts';
import { castAbility, hitElement, stepBurrow, stepDash, stepZones, type BurrowState, type DashState, type Zone } from './abilities.ts';
import { applyElementHit, applyStatus, BURN_DPS, BURN_TICK_SEC, STATUS_SEC, statusSpeedMul } from './elements.ts';
import { BOUNTY_START, bountyAfterKO, KO_COINS, koPurse } from './bounty.ts';
import {
  bountyMulFor, noteAttackHit, onKO, resetOnDeath, resetOnSpawn, stepPassives, takeFlow, toonSave, ultGainMul,
} from './passives.ts';
import { canSee, REVEAL_SEC } from './visibility.ts';
import {
  CHEST_HP, CHEST_RADIUS, CHEST_SPOTS, PICKUP_HEAL, PICKUP_RADIUS, PICKUP_SEC, PICKUP_ULT_FRAC,
  Tide, inWater, pickupFor, WATER_SLOW, WATER_WET_SEC,
} from './tide.ts';

export const BASE_SPEED = 240;
/** default body radius (kits carry their own `radius`) */
export const PLAYER_RADIUS = 32;

/** A low-tide treasure chest: destructible scenery that drops one reward. */
export interface Chest {
  id: number;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  /** sin phase so every chest bobs on its own beat (visual only) */
  bob: number;
}

/** A reward lying on the deck after a chest broke. */
export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  /** seconds before it sinks */
  left: number;
}

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
  /** seconds of "cannot walk" left (MUD root): attacks still work */
  rootLeft: number;
  /** burn accumulator, so the 4 dmg/s lands in half-second chunks */
  burnT: number;
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
  /** doubloons collected from chests and KO purses (the coin stash) */
  gold: number;
  /** Bounty Brawl score (T19): starts at BOUNTY_START and grows with every KO */
  bounty: number;
  /** seconds of continuous flood water under the body (see tide.ts) */
  waterT: number;
  /** EVOLVE (T20): KOs counted this life and whether the crest is up */
  evolveKos: number;
  evolved: boolean;
  /** FLOW (T20): attack hits inside the window, the window timer and the armed flag */
  flowHits: number;
  flowT: number;
  flowReady: boolean;
  /** TOON LOGIC (T20): the free save is used per life; `toonLeft` = pancake seconds */
  toonUsed: boolean;
  toonLeft: number;
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
  /** rising-tide clock (design §2.10) */
  tide = new Tide();
  /** low-tide treasure chests */
  chests: Chest[] = [];
  /** unclaimed chest rewards */
  picks: Pickup[] = [];
  private nextProj = 1;
  /** rotates the pickup reward so chests do not always drop the same thing */
  private pickupRotor = 0;

  addPlayer(id: number, name: string, fighter = 'default', bot = false): SimPlayer {
    const s = SPAWNS[(id - 1) % SPAWNS.length];
    const def = getFighter(fighter);
    const p: SimPlayer = {
      id, name, fighter: def.id, def, x: s.x, y: s.y, r: def.radius,
      hp: def.maxHp, mhp: def.maxHp, speedMul: def.speedMul, aim: 0, ack: 0, input: null,
      ammo: def.ammo, reload: 0, fireCd: 0, fireLatch: false, spcCd: 0, uc: 0, dash: null, burrow: null,
      buffMul: 1, buffLeft: 0, status: null, statusLeft: 0, rootLeft: 0, burnT: 0, trapTook: 0,
      revealT: 0, down: false, respawn: 0, shield: C.SHIELD_SEC, kos: 0, deaths: 0, pendingFighter: null,
      gold: 0, bounty: BOUNTY_START, waterT: 0, bot,
      evolveKos: 0, evolved: false, flowHits: 0, flowT: 0, flowReady: false, toonUsed: false, toonLeft: 0,
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

  /**
   * Rising-tide clock + treasure bookkeeping. Chests surface when the tide bottoms out and are
   * swallowed as it rises again; rewards already on the deck stay until picked up or sunk.
   */
  private stepTide(dt: number): void {
    const entered = this.tide.step(dt);
    if (entered === 'low') {
      this.chests = CHEST_SPOTS.map((s, i) => ({
        id: this.newProjId(), x: s.x, y: s.y, hp: CHEST_HP, mhp: CHEST_HP, bob: i * 1.7,
      }));
    } else if (entered === 'rising') {
      this.chests = []; // the flood swallows whatever is left
    }
    if (!this.picks.length) return;
    const keep: Pickup[] = [];
    for (const pk of this.picks) {
      pk.left -= dt;
      let taken = false;
      for (const p of this.players.values()) {
        if (p.down || p.burrow) continue;
        if (Math.hypot(p.x - pk.x, p.y - pk.y) > p.r + PICKUP_RADIUS) continue;
        this.collect(p, pk);
        taken = true;
        break;
      }
      if (!taken && pk.left > 0) keep.push(pk);
    }
    this.picks = keep;
  }

  /** Rising-tide water at the current flood level (used by the shock chain, bots and tests). */
  inWaterAt(x: number, y: number): boolean {
    return inWater(x, y, this.tide.level);
  }

  /** Grant one chest reward (heal / ult charge / doubloons). */
  private collect(p: SimPlayer, pk: Pickup): void {
    if (pk.kind === 'heal') p.hp = Math.min(p.mhp, p.hp + PICKUP_HEAL);
    else if (pk.kind === 'ult') p.uc = Math.min(p.def.ultCharge, p.uc + p.def.ultCharge * PICKUP_ULT_FRAC);
    else p.gold++;
    this.events.push({ k: 'pick', id: p.id, kind: pk.kind, x: Math.round(pk.x), y: Math.round(pk.y) });
  }

  /** Damage a treasure chest; a broken chest drops a reward on the deck. */
  damageChest(attacker: number, chest: Chest, dmg: number): void {
    if (dmg <= 0 || chest.hp <= 0) return;
    chest.hp -= dmg;
    const a = this.players.get(attacker);
    if (a) a.uc = Math.min(a.def.ultCharge, a.uc + Math.min(dmg, chest.mhp) * 0.5 * ultGainMul(a));
    if (chest.hp > 0) return;
    chest.hp = 0;
    this.chests = this.chests.filter((c) => c !== chest);
    this.events.push({ k: 'chest', x: Math.round(chest.x), y: Math.round(chest.y) });
    this.picks.push({
      id: this.newProjId(), x: chest.x, y: chest.y, kind: pickupFor(this.pickupRotor++), left: PICKUP_SEC,
    });
  }

  step(dt = 1 / TICK_HZ): void {
    this.tick++;
    this.stepTide(dt);
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
      if (p.rootLeft > 0) p.rootLeft = Math.max(0, p.rootLeft - dt);
      stepPassives(p, dt);
      // burn: 4 dmg/s, applied in half-second chunks so the damage FX does not run at 30 Hz
      if (p.status === 'burn' && !p.down && p.shield <= 0) {
        p.burnT += dt;
        if (p.burnT >= BURN_TICK_SEC) {
          p.burnT -= BURN_TICK_SEC;
          this.damage(-1, p, BURN_DPS * BURN_TICK_SEC, p.x, p.y);
        }
      } else {
        p.burnT = 0;
      }
      // a bubble trap holds the victim in place; a stun locks input the same way, a toon pancake
      // only freezes for its half second (TOON LOGIC, T20)
      const trapped = p.status === 'trapped';
      const disabled = trapped || p.status === 'stun' || p.toonLeft > 0;
      if (disabled) p.dash = null;
      const burrowing = stepBurrow(this, p, dt);
      if (burrowing) { p.fireLatch = false; continue; }
      const dashing = !disabled && stepDash(this, p, dt);
      const flooding = inWater(p.x, p.y, this.tide.level);
      if (i) {
        if (!dashing && !disabled) {
          const spd = BASE_SPEED * p.speedMul * (p.buffLeft > 0 ? p.buffMul : 1) * statusSpeedMul(p.status)
            * (flooding ? WATER_SLOW : 1);
          const rooted = p.rootLeft > 0;
          if (!rooted) stepMove(p, i.mx, i.my, spd, dt);
        }
        if (!disabled && Number.isFinite(i.ax) && Number.isFinite(i.ay) && (i.ax !== 0 || i.ay !== 0)) p.aim = Math.atan2(i.ay, i.ax);
        p.ack = i.seq;
      }
      this.reloadStep(p, dt);
      // standing in flood water soaks you: Wet once per second of contact
      if (flooding) {
        p.waterT += dt;
        if (p.waterT >= WATER_WET_SEC) {
          p.waterT = 0;
          applyStatus(p, 'wet', STATUS_SEC.wet);
          this.events.push({ k: 'status', v: p.id, s: 'wet', sec: STATUS_SEC.wet });
        }
      } else p.waterT = 0;
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
    // FLOW (T20): an armed combo empowers this attack and shows the ribbon swirl
    const flow = takeFlow(p);
    if (flow) {
      this.events.push({ k: 'passive', v: p.id, p: 'flow', x: Math.round(p.x), y: Math.round(p.y) });
    }
    castAbility(this, p, p.def.attack, 'attack', flow ?? undefined);
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
          // only attack shots feed FLOW; specials and ults do not (T20)
          if (pr.slot === 'attack' && !v.down) {
            const a = this.players.get(pr.owner);
            if (a) noteAttackHit(a);
          }
          // a spawn shield absorbs the hit entirely: no status either
          if (!v.down && v.shield <= 0) {
            const el = hitElement(pr.element, pr.status ?? null);
            const react = applyElementHit(this, pr.owner, v, pr.status ?? null, pr.statusSec ?? 0, el);
            if (react === null && pr.status) {
              this.events.push({ k: 'status', v: v.id, s: pr.status, sec: pr.statusSec ?? 1 });
            }
          }
          if (dead) break;
        }
        // treasure chests are scenery but they can be shot open
        if (!dead && !pr.lob) {
          for (const c of this.chests) {
            if (c.hp <= 0) continue;
            if (Math.hypot(c.x - pr.x, c.y - pr.y) >= CHEST_RADIUS + pr.r) continue;
            this.damageChest(pr.owner, c, pr.dmg);
            if (!pr.pierce) { dead = true; break; }
          }
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
    if (a && a.id !== v.id && dealt > 0) a.uc = Math.min(a.def.ultCharge, a.uc + dealt * ultGainMul(a));
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
    // TOON LOGIC (T20): the first lethal hit of a life leaves a 1-HP pancake instead of a KO
    if (toonSave(v, this.events)) return;
    v.down = true;
    v.respawn = C.RESPAWN_SEC;
    v.deaths++;
    v.dash = null;
    v.burrow = null;
    v.status = null;
    v.statusLeft = 0;
    v.trapTook = 0;
    // Bounty Brawl (T19): the purse comes out of the victim's bounty and the body drops coins
    const pay = a && a.id !== v.id ? koPurse(v.bounty) : 0;
    if (a) a.kos++;
    if (a && a.id !== v.id) {
      a.gold += pay;
      a.bounty = bountyAfterKO(a.bounty, bountyMulFor(a));
    }
    // faction passives see the KO before the victim's stats reset (EVOLVE / PLUNDER)
    if (a) onKO(a, v, this.events);
    resetOnDeath(v);
    v.bounty = BOUNTY_START;
    this.dropCoins(v, KO_COINS);
    this.events.push({ k: 'ko', a: attacker, v: v.id, pay });
  }

  /** Scatter doubloon pickups around a KO'd body (the corpse pays out three coins). */
  private dropCoins(p: SimPlayer, n: number): void {
    const r = Math.max(24, p.r + 18);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const x = Math.max(24, Math.min(WORLD_W - 24, p.x + Math.cos(a) * r));
      const y = Math.max(24, Math.min(WORLD_H - 24, p.y + Math.sin(a) * r));
      this.picks.push({ id: this.newProjId(), x, y, kind: 'gold', left: PICKUP_SEC });
    }
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
    resetOnSpawn(p);
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

  /** Debug: jump the tide to the start of a phase (`?tide=high` screenshots). */
  debugTide(phase: string): void {
    if (phase === 'low' || phase === 'rising' || phase === 'high' || phase === 'falling') this.tide.force(phase);
  }

  clearEvents(): void {
    this.events = [];
  }

  /**
   * New round: clear the scoreboard once the bounty went. The coin stash resets too, so both
   * results screens talk about this round only; positions, HP and live projectiles stay.
   */
  resetScores(): void {
    for (const p of this.players.values()) {
      p.kos = 0;
      p.deaths = 0;
      p.bounty = BOUNTY_START;
      p.gold = 0;
    }
  }

  snapshotFor(viewerId: number): SnapMsg {
    const players: SnapPlayer[] = [];
    const viewer = this.players.get(viewerId);
    // steam clouds hide like a kelp bush (reaction FX, see elements.ts)
    const hides = this.zones.filter((z) => z.hides);
    for (const p of this.players.values()) {
      // underground players are hidden from everybody but the owner
      if (p.burrow && p.id !== viewerId) continue;
      // kelp hides fighters from far enemies unless they just attacked
      if (viewer && !canSee(viewer, p, hides)) continue;
      players.push({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, mhp: p.mhp,
        f: p.fighter, n: p.name, st: statusMask(p.status),
        a: Math.round((p.aim * 180) / Math.PI),
        am: p.ammo, dn: p.down ? 1 : 0, sh: p.shield > 0 ? 1 : 0, k: p.kos, d: p.deaths, b: p.bounty,
        uc: Math.round(Math.max(0, Math.min(1, p.uc / p.def.ultCharge)) * 100),
        cd: Math.round(p.spcCd * 10) / 10,
        ev: p.evolved ? 1 : undefined,
      });
    }
    return {
      t: 'snap', tick: this.tick, ts: Date.now(), ack: this.players.get(viewerId)?.ack ?? 0, players,
      projs: this.projs.map((q) => ({ id: q.id, x: Math.round(q.x), y: Math.round(q.y), o: q.owner })),
      ev: this.events,
      tide: this.tide.info(),
      chests: this.chests.map((c) => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), hp: c.hp, mhp: c.mhp })),
      picks: this.picks.map((k) => ({ id: k.id, x: Math.round(k.x), y: Math.round(k.y), k: k.kind })),
    };
  }
}
