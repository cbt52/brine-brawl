import { TICK_HZ, WORLD_W, WORLD_H } from '../constants.ts';
import { OBSTACLES } from '../arena/docks.ts';
import type { Rect } from '../arena/docks.ts';
import { DOCKS_ARENA, type Arena } from '../arena/arena.ts';
import type { AbilitySlot, PickupKind, RoomMode, SimEvent, SnapJelly, SnapMsg, SnapPlayer, SnapVolley, Weather } from '../protocol.ts';
import { getFighter } from '../fighters/index.ts';
import { statusMask, TRAP_BREAK_DMG, type FighterDef, type StatusKind } from '../fighters/types.ts';
import { pushOutRect, resolveWalls, separate } from './collide.ts';
import * as C from './combat.ts';
import type { Projectile } from './combat.ts';
import { castAbility, hitElement, stepBurrow, stepDash, stepZones, type BurrowState, type DashState, type Zone } from './abilities.ts';
import { applyElementHit, applyStatus, BURN_DPS, BURN_TICK_SEC, STATUS_SEC, statusSpeedMul } from './elements.ts';
import { stepWalls, wallRect, wallRects, type Wall } from './walls.ts';
import { stepSummons, type Summon } from './summons.ts';
import { makePurrl, PURRL_HEAL, PURRL_R, stepPurrl, type Purrl } from './purrl.ts';
import { BOUNTY_START, bountyAfterKO, KO_COINS, koPurse } from './bounty.ts';
import {
  bountyMulFor, noteAttackHit, onKO, resetOnDeath, resetOnSpawn, stepPassives, takeFlow, toonSave, ultGainMul,
} from './passives.ts';
import { canSee, REVEAL_SEC } from './visibility.ts';
import { CANNON_DMG, volleyAt, volleyHits } from './cannon.ts';
import { sameTeam, type Team } from './teams.ts';
import {
  CHEST_HP, CHEST_RADIUS, CHEST_SPOTS, PICKUP_HEAL, PICKUP_RADIUS, PICKUP_SEC, PICKUP_ULT_FRAC,
  Tide, inWater, pickupFor, WATER_SLOW, WATER_WET_SEC,
} from './tide.ts';
import { tideRate } from './weather.ts';
import { BUBBLE_LIFT, BUBBLE_SLOW, inBubble, makeBubbles, stepBubbles, type Bubble } from './bubbles.ts';
import {
  JELLY_STING, JELLY_STING_CD, jellyLunging, jellyTouches, makeJellies, stepJellies, type Jelly,
} from './jellies.ts';
import {
  SHOWDOWN_EDGE_TICK_SEC, edgeDamage, lastSideInRing, outsideRing, showdownTideLevel,
} from './showdown.ts';
import { COIN_SEC, DROP_MAX, SPOT, Treasure, teamTotals } from './treasure.ts';
import {
  COMBO_BONUS, COMBO_BURST_RADIUS, COMBO_WINDOW_SEC, comboName, comboPartner, type UltHit,
} from './combo.ts';

export const BASE_SPEED = 240;
/** default body radius (kits carry their own `radius`) */
export const PLAYER_RADIUS = 32;
/** how fast a homing shot turns (rad/s) and how far it looks for a target */
const HOMING_TURN = 6;
const HOMING_RANGE = 340;
/** how far a returning boomerang may fly back before it gives up (longer than any outbound leg) */
const RETURN_RANGE = 3000;

/** wrap an angle difference into (-π, π] */
function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let x = a % t;
  if (x > Math.PI) x -= t;
  if (x < -Math.PI) x += t;
  return x;
}

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
  /** skin index from `join` (shared/skins.ts); 0 = the drawn look */
  skin: number;
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
  /** damage-taken multiplier while `dmgMulLeft` runs (Shell Spin) */
  dmgMul: number;
  dmgMulLeft: number;
  status: StatusKind | null;
  statusLeft: number;
  /** seconds of "cannot walk" left (MUD root): attacks still work */
  rootLeft: number;
  /** burn accumulator, so the 4 dmg/s lands in half-second chunks */
  burnT: number;
  /** Showdown edge accumulator: time spent outside the ring, lands in half-second chunks (backlog #6) */
  edgeT: number;
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
  /** Purrl's heal is spent for this life (backlog #1); respawn clears it */
  purrlFed: boolean;
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
  /** team A/B for crew matches (T26); `null` = no teams, i.e. friendly fire is on */
  team: Team | null;
  /** doubloons carried on the body in Treasure Tide (T27); they spill on a KO */
  carry: number;
  bot?: boolean;
}

const clamp1 = (n: number) => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);

/** Apply one movement step to a body; shared with client prediction.
 * `extra` holds dynamic obstacles (stone walls), so prediction can replay the same step.
 * `bubbles` holds the bubble storm (backlog #17): inside one the body walks slower and is carried up.
 * `base` is the arena's static scenery (the docks coral unless a World plays another layout). */
export function stepMove(
  p: { x: number; y: number; r: number },
  mx: number,
  my: number,
  speed: number,
  dt: number,
  extra?: readonly Rect[],
  bubbles?: readonly Bubble[],
  base: Rect[] = OBSTACLES,
): void {
  mx = clamp1(mx);
  my = clamp1(my);
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const carried = inBubble(bubbles, p.x, p.y, p.r);
  const k = carried ? BUBBLE_SLOW : 1;
  p.x += mx * speed * dt * k;
  p.y += my * speed * dt * k;
  if (carried) p.y -= BUBBLE_LIFT * dt;
  resolveWalls(p, extra && extra.length ? base.concat(extra) : base);
}

export class World {
  /** the layout this round is played on (docks by default; the galleon is GALLEON_ARENA) */
  arena: Arena;
  players = new Map<number, SimPlayer>();
  tick = 0;
  projs: Projectile[] = [];
  zones: Zone[] = [];
  /** temporary stone walls built in-match (Brak's Stone Wall, T22) */
  walls: Wall[] = [];
  /** standing decoys and turrets (Longshot Lenny's decoy, Teeny Krill's turret; T31/T32) */
  summons: Summon[] = [];
  events: SimEvent[] = [];
  /** rising-tide clock (design §2.10) */
  tide = new Tide();
  /** this round's Weird Weather modifier (backlog #4); the room rolls it at each round start */
  weather: Weather = 'clear';
  /** the bubble storm's bubbles (backlog #17); empty unless this round rolled it */
  bubbles: Bubble[] = [];
  /** the jellyfish rain's jellies (backlog #30); empty unless this round rolled it */
  jellies: Jelly[] = [];
  /** room mode (T26/T27): Bounty Brawl, Treasure Tide or Showdown (backlog #6) */
  mode: RoomMode = 'bounty';
  /** seconds into the current round, set by the room; drives the Showdown ring (backlog #6) */
  roundT = 0;
  /** Treasure Tide coin economy (T27); `null` in Bounty Brawl */
  treasure: Treasure | null = null;
  /** low-tide treasure chests */
  chests: Chest[] = [];
  /** true once the current low tide has been stocked, so a round does not wait for the next one */
  private lootSeeded = false;
  /** unclaimed chest rewards */
  picks: Pickup[] = [];
  /** the sea snail that wanders the sand and heals the hurt (backlog #1) */
  purrl: Purrl = makePurrl();
  private nextProj = 1;
  /** rotates the pickup reward so chests do not always drop the same thing */
  private pickupRotor = 0;
  /** recent ult landings, kept for the 1.5 s Crew Combo window (T28) */
  private ultHits: UltHit[] = [];
  /** per body: the `cannon:volley` keys it has already been hit by (slice 3a, cleared on respawn) */
  private cannonHits = new Map<number, Set<string>>();

  constructor(arena: Arena = DOCKS_ARENA) {
    this.arena = arena;
  }

  addPlayer(id: number, name: string, fighter = 'default', bot = false, team: Team | null = null): SimPlayer {
    const spawns = this.arena.spawns;
    const s = spawns[(id - 1) % spawns.length];
    const def = getFighter(fighter);
    const p: SimPlayer = {
      id, name, fighter: def.id, skin: 0, def, x: s.x, y: s.y, r: def.radius,
      hp: def.maxHp, mhp: def.maxHp, speedMul: def.speedMul, aim: 0, ack: 0, input: null,
      ammo: def.ammo, reload: 0, fireCd: 0, fireLatch: false, spcCd: 0, uc: 0, dash: null, burrow: null,
      buffMul: 1, buffLeft: 0, dmgMul: 1, dmgMulLeft: 0, status: null, statusLeft: 0, rootLeft: 0, burnT: 0, edgeT: 0, trapTook: 0,
      revealT: 0, down: false, respawn: 0, shield: C.SHIELD_SEC, kos: 0, deaths: 0, pendingFighter: null, purrlFed: false,
      gold: 0, bounty: BOUNTY_START, waterT: 0, bot, team, carry: 0,
      evolveKos: 0, evolved: false, flowHits: 0, flowT: 0, flowReady: false, toonUsed: false, toonLeft: 0,
    };
    this.players.set(id, p);
    this.events.push({ k: 'spawn', id });
    return p;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
    this.cannonHits.delete(id);
  }

  /** Round clock for the Showdown ring (backlog #6); the room feeds it once per sim step. */
  setRoundT(t: number): void {
    this.roundT = t;
  }

  /** Showdown last-standing finish (backlog #20): true once one side is the only one left inside the ring. */
  lastStanding(): boolean {
    return this.mode === 'showdown' && lastSideInRing([...this.players.values()], this.roundT);
  }

  /** Set the round's Weird Weather modifier (backlog #4). */
  setWeather(w: Weather): void {
    this.weather = w;
    this.bubbles = w === 'bubble-storm' ? makeBubbles() : [];
    this.jellies = w === 'jelly-rain' ? makeJellies() : [];
  }

  /** Pick the room mode; Treasure Tide grows its own coin/countdown bookkeeping. */
  setMode(mode: RoomMode): void {
    this.mode = mode;
    this.treasure = mode === 'treasure' ? new Treasure() : null;
  }

  /** Put a fighter on crew A/B (rooms auto-balance; tests set it directly). */
  setTeam(id: number, team: Team | null): void {
    const p = this.players.get(id);
    if (p) p.team = team;
  }

  /** True when a hit from `attacker` must not land on `v` because both are on the same crew. */
  friendly(attacker: number, v: SimPlayer): boolean {
    const a = this.players.get(attacker);
    return !!a && a.id !== v.id && sameTeam(a, v);
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

  /** Skin is cosmetic: it applies at once and rides every snapshot (`sk`). */
  setSkin(id: number, skin: number): void {
    const p = this.players.get(id);
    if (p) p.skin = skin;
  }

  setInput(id: number, input: SimInput): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.input && input.seq < p.input.seq) return;
    if (input.atk && !p.input?.atk) p.fireLatch = true;
    p.input = input;
  }

  /** Put a fresh chest on every low-tide spot. */
  private seedChests(): void {
    this.chests = CHEST_SPOTS.map((s, i) => ({
      id: this.newProjId(), x: s.x, y: s.y, hp: CHEST_HP, mhp: CHEST_HP, bob: i * 1.7,
    }));
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
    // Showdown (backlog #6): the flood follows the closing ring, not the phase clock
    this.tide.override = this.mode === 'showdown' ? showdownTideLevel(this.roundT) : null;
    const entered = this.tide.step(dt * tideRate(this.weather));
    if (entered === 'rising') this.chests = []; // the flood swallows whatever is left
    // stock the pools as soon as the tide is low — the round may start mid-low, and that is when the
    // treasure is on the sand (§2.10); one seeding per low tide, so a picked-clean pool stays empty
    if (this.tide.phase === 'low') {
      if (!this.lootSeeded) { this.seedChests(); this.lootSeeded = true; }
    } else {
      this.lootSeeded = false;
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

  /**
   * Treasure Tide (T27): the sunken chest surfaces one doubloon every few seconds, and the crew that
   * holds enough of them runs a 15 s escape countdown. Returns the winning crew once it ran out.
   */
  private stepTreasure(dt: number): Team | null {
    const tr = this.treasure;
    if (!tr) return null;
    const { spawn } = tr.step(dt, teamTotals([...this.players.values()]));
    if (spawn) {
      // a small deterministic ring offset so coins do not stack exactly on the chest
      const a = ((this.tick % 8) / 8) * Math.PI * 2;
      this.picks.push({
        id: this.newProjId(), x: SPOT.x + Math.cos(a) * 20, y: SPOT.y + Math.sin(a) * 14,
        kind: 'gold', left: COIN_SEC,
      });
    }
    return tr.won;
  }

  /** Rising-tide water at the current flood level (used by the shock chain, bots and tests). */
  inWaterAt(x: number, y: number): boolean {
    return inWater(x, y, this.tide.level, this.arena.shallows);
  }

  /** Grant one chest reward (heal / ult charge / doubloons). */
  private collect(p: SimPlayer, pk: Pickup): void {
    if (pk.kind === 'heal') p.hp = Math.min(p.mhp, p.hp + PICKUP_HEAL);
    else if (pk.kind === 'ult') p.uc = Math.min(p.def.ultCharge, p.uc + p.def.ultCharge * PICKUP_ULT_FRAC);
    else {
      p.gold++;
      // Treasure Tide: doubloons ride on the body instead of the purse (T27)
      if (this.treasure) p.carry++;
    }
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

  /** Chew a stone wall; it crumbles at 0 hp (scenery, so no killer credit). */
  damageWall(attacker: number, wall: Wall, dmg: number): void {
    if (dmg <= 0 || wall.hp <= 0) return;
    wall.hp -= dmg;
    const a = this.players.get(attacker);
    if (a) a.uc = Math.min(a.def.ultCharge, a.uc + Math.min(dmg, wall.mhp) * 0.3 * ultGainMul(a));
    if (wall.hp > 0) return;
    wall.hp = 0;
    this.walls = this.walls.filter((w) => w !== wall);
    this.events.push({ k: 'wall', x: Math.round(wall.x + wall.w / 2), y: Math.round(wall.y + wall.h / 2) });
  }

  /** A shot that walks into a stone slab: stop it there and damage the slab. */
  private wallHit(pr: Projectile): boolean {
    if (!this.walls.length) return false;
    const b = { x: pr.x, y: pr.y, r: pr.r };
    for (const wall of this.walls) {
      if (!pushOutRect(b, wallRect(wall))) continue;
      pr.x = b.x;
      pr.y = b.y;
      this.damageWall(pr.owner, wall, Math.max(1, pr.dmg));
      return true;
    }
    return false;
  }

  /** Showdown (backlog #6): a body outside the closing ring takes edge damage in half-second chunks. */
  private stepEdge(p: SimPlayer, dt: number): void {
    if (this.mode !== 'showdown' || !outsideRing(p.x, p.y, this.roundT)) {
      p.edgeT = 0;
      return;
    }
    p.edgeT += dt;
    if (p.edgeT < SHOWDOWN_EDGE_TICK_SEC) return;
    const dmg = edgeDamage(p.x, p.y, this.roundT, p.edgeT);
    p.edgeT = 0;
    this.damage(-1, p, dmg, p.x, p.y);
  }

  step(dt = 1 / TICK_HZ): void {
    this.tick++;
    this.stepTide(dt);
    this.stepTreasure(dt);
    stepBubbles(this.bubbles, dt);
    stepJellies(this.jellies, dt);
    this.stepJellyStings();
    // static coral plus whatever stone a fighter built: one list for bodies, one for aging
    const stone = this.walls.length ? wallRects(this.walls) : undefined;
    const block = stone ? this.arena.obstacles.concat(stone) : this.arena.obstacles;
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
      if (p.dmgMulLeft > 0) {
        p.dmgMulLeft -= dt;
        if (p.dmgMulLeft <= 0) { p.dmgMulLeft = 0; p.dmgMul = 1; }
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
      // the burn can be the killing blow: the corpse must not move/reload/fire on this tick
      if (p.down) continue;
      this.stepEdge(p, dt);
      if (p.down) continue;
      // a bubble trap holds the victim in place; a stun locks input the same way, a toon pancake
      // only freezes for its half second (TOON LOGIC, T20)
      const trapped = p.status === 'trapped';
      const disabled = trapped || p.status === 'stun' || p.toonLeft > 0;
      if (disabled) p.dash = null;
      const burrowing = stepBurrow(this, p, dt);
      if (burrowing) { p.fireLatch = false; continue; }
      const dashing = !disabled && stepDash(this, p, dt);
      const flooding = inWater(p.x, p.y, this.tide.level, this.arena.shallows);
      if (i) {
        if (!dashing && !disabled) {
          const spd = BASE_SPEED * p.speedMul * (p.buffLeft > 0 ? p.buffMul : 1) * statusSpeedMul(p.status)
            * (flooding ? WATER_SLOW : 1);
          const rooted = p.rootLeft > 0;
          if (!rooted) stepMove(p, i.mx, i.my, spd, dt, stone, this.bubbles, this.arena.obstacles);
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
    this.walls = stepWalls(this.walls, dt);
    stepSummons(this, dt);
    this.stepPurrlSnail(dt);
    const alive = list.filter((p) => !p.down && !p.burrow);
    separate(alive);
    for (const p of alive) resolveWalls(p, block);
    this.stepProjectiles(dt);
    this.stepCannons();
  }

  /** Cannon volleys on their lanes right now (backlog #26): the client draws telegraphs and bars from these. */
  private volleySnap(): SnapVolley[] | undefined {
    const t = this.tick / TICK_HZ;
    const out: SnapVolley[] = [];
    this.arena.cannons.forEach((c, i) => {
      const v = volleyAt(c, t);
      if (v) out.push({ i, st: v.stage, age: Math.round(v.age * 100) / 100 });
    });
    return out.length ? out : undefined;
  }

  /** Deck cannons (slice 3a): a volley's moving bar damages each body it crosses, once per volley. */
  private stepCannons(): void {
    if (!this.arena.cannons.length) return;
    const t = this.tick / TICK_HZ;
    this.arena.cannons.forEach((c, ci) => {
      const v = volleyAt(c, t);
      if (!v || v.stage !== 'fire') return;
      for (const p of this.players.values()) {
        if (p.down || !volleyHits(c, v, p.x, p.y, p.r)) continue;
        let seen = this.cannonHits.get(p.id);
        if (!seen) this.cannonHits.set(p.id, seen = new Set());
        const key = `${ci}:${v.k}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.damage(-1, p, CANNON_DMG, p.x, p.y);
      }
    });
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

  /** Homing moths (Lantern Swarm): turn the velocity toward the nearest enemy, keeping the speed. */
  private steer(pr: Projectile, dt: number): void {
    let best: SimPlayer | null = null;
    let bestD = HOMING_RANGE;
    for (const v of this.players.values()) {
      if (v.id === pr.owner || v.down || v.burrow) continue;
      if (this.friendly(pr.owner, v)) continue;
      const d = Math.hypot(v.x - pr.x, v.y - pr.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best) return;
    const want = Math.atan2(best.y - pr.y, best.x - pr.x);
    const cur = Math.atan2(pr.vy, pr.vx);
    const maxTurn = HOMING_TURN * dt;
    const a = cur + Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(want - cur)));
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    pr.vx = Math.cos(a) * sp;
    pr.vy = Math.sin(a) * sp;
  }

  private stepProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projs) {
      if (pr.homing) this.steer(pr, dt);
      // Boomerang (Kip): the return leg steers at its owner and ends when it gets there
      if (pr.returns && pr.returning) {
        const own = this.players.get(pr.owner);
        if (!own || own.down || own.burrow) continue;
        if (Math.hypot(own.x - pr.x, own.y - pr.y) <= own.r + pr.r) continue;
        const want = Math.atan2(own.y - pr.y, own.x - pr.x);
        const fly = Math.hypot(pr.vx, pr.vy) || 1;
        pr.vx = Math.cos(want) * fly;
        pr.vy = Math.sin(want) * fly;
      }
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
          for (const w of this.arena.obstacles) {
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
          // stone walls block shots (no bounces: the slab takes the hit instead)
          if (this.wallHit(pr)) { dead = true; break; }
        }
        // decoys and turrets are bodies too: an enemy shot hits them, a crew's passes through (T31)
        if (!pr.lob) {
          for (const s of this.summons) {
            if (s.hp <= 0) continue;
            if (s.owner === pr.owner) continue;
            const so = this.players.get(s.owner);
            if (so && this.friendly(pr.owner, so)) continue;
            if (Math.hypot(s.x - pr.x, s.y - pr.y) >= s.r + pr.r) continue;
            if (pr.pierce) {
              pr.hitSum ??= new Set();
              if (pr.hitSum.has(s.id)) continue;
              pr.hitSum.add(s.id);
            }
            s.hp -= pr.dmg;
            if (!pr.pierce) dead = true;
            if (dead) break;
          }
        }
        for (const v of this.players.values()) {
          if (v.id === pr.owner || v.down || v.burrow) continue;
          // a teammate never blocks the shot: it flies straight through (T26)
          if (this.friendly(pr.owner, v)) {
            // Remedy Dart (T31): a friendly shot patches the teammate up instead of flying on
            if (pr.allyHeal && pr.allyHeal > 0) {
              const heal = Math.min(v.mhp - v.hp, pr.allyHeal);
              if (heal > 0) {
                v.hp += heal;
                this.events.push({ k: 'heal', v: v.id, n: Math.round(heal), x: Math.round(v.x), y: Math.round(v.y) });
              }
              if (!pr.pierce) dead = true;
              if (dead) break;
            }
            continue;
          }
          if (Math.hypot(v.x - pr.x, v.y - pr.y) >= v.r + pr.r) continue;
          if (pr.pierce) {
            pr.hit ??= new Set();
            if (pr.hit.has(v.id)) continue;
            pr.hit.add(v.id);
          } else dead = true;
          this.damage(pr.owner, v, pr.dmg, pr.x, pr.y, pr.slot);
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
      if (!dead && pr.left <= 0) {
        if (pr.returns && !pr.returning) {
          // turn the boomerang around: the way back can hit every enemy once more
          pr.returning = true;
          pr.hit = new Set();
          pr.hitSum = new Set();
          pr.left = RETURN_RANGE;
        } else dead = true;
      }
      if (dead && pr.aoeOnEnd) {
        this.zones.push({
          id: this.newProjId(), owner: pr.owner, x: pr.x, y: pr.y, r: pr.aoeOnEnd.radius,
          delay: 0, dur: 0, dmg: pr.aoeOnEnd.dmg, tickDmg: 0, push: 0, pull: 0, tickPull: 0,
          coneDeg: 0, aim: 0, status: pr.aoeOnEnd.status ?? null, statusSec: pr.aoeOnEnd.statusSec ?? 0,
          selfHeal: 0, rootSec: 0, dropGold: 0, allyHeal: 0,
          element: hitElement(pr.element, pr.aoeOnEnd.status ?? null), tickT: 0, fired: false, slot: pr.slot,
        });
      }
      if (!dead && pr.left > 0) keep.push(pr);
    }
    this.projs = keep;
  }

  /** Single damage entry point: also feeds the attacker's ult charge and Crew Combo bookkeeping. */
  /** Jellyfish rain (backlog #30): a fighter a jelly touches is stung, once per jelly per cooldown. */
  private stepJellyStings(): void {
    for (const j of this.jellies) {
      for (const p of this.players.values()) {
        if (p.down || j.cd.has(p.id) || !jellyTouches(j, p.x, p.y, p.r)) continue;
        j.cd.set(p.id, JELLY_STING_CD);
        this.damage(-1, p, JELLY_STING, p.x, p.y);
      }
    }
  }

  damage(attacker: number, v: SimPlayer, dmg: number, x: number, y: number, slot?: AbilitySlot): void {
    if (v.shield > 0 || v.down || v.burrow) return;
    // no friendly fire (T26): a teammate's shot, zone or splash passes through
    if (this.friendly(attacker, v)) return;
    // Shell Spin and friends take less damage while their buff runs
    if (v.dmgMulLeft > 0) dmg *= v.dmgMul;
    // Hunker turns the body to stone: a 0 multiplier lands no hit event at all
    if (dmg <= 0) return;
    const dealt = Math.max(0, Math.min(v.hp, dmg));
    v.hp = Math.max(0, v.hp - dmg);
    this.events.push({ k: 'hit', a: attacker, v: v.id, dmg, x: Math.round(x), y: Math.round(y) });
    const a = this.players.get(attacker);    if (a && a.id !== v.id && dealt > 0) a.uc = Math.min(a.def.ultCharge, a.uc + dealt * ultGainMul(a));
    // two crewmates' ults on the same enemy or area pair up (T28)
    if (slot === 'ult') this.noteUltHit(a, v, dealt);
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
    // Bounty Brawl (T19): the purse comes out of the victim's bounty and the body drops coins.
    // Treasure Tide scores carried doubloons instead, so the purse stays out of it (T27).
    const pay = !this.treasure && a && a.id !== v.id ? koPurse(v.bounty) : 0;
    if (a) a.kos++;
    if (a && a.id !== v.id && !this.treasure) {
      a.gold += pay;
      a.bounty = bountyAfterKO(a.bounty, bountyMulFor(a));
    }
    // Treasure Tide (T27): the carried pile spills on the deck — the whole point of the mode
    const spilled = Math.min(DROP_MAX, Math.max(0, v.carry));
    // faction passives see the KO before the victim's stats reset (EVOLVE / PLUNDER)
    if (a) onKO(a, v, this.events);
    resetOnDeath(v);
    v.bounty = BOUNTY_START;
    v.carry = 0;
    if (this.treasure) {
      if (spilled > 0) this.dropGold(v.x, v.y, spilled, Math.max(30, v.r + 20));
    } else this.dropCoins(v, KO_COINS);
    this.events.push({ k: 'ko', a: attacker, v: v.id, pay });
  }

  /**
   * Crew Combo (T28): remember an ult landing and, when a crewmate's ult landed on the same enemy or
   * within 300 u inside the last 1.5 s, add a burst of +40 % of this hit around the contact point.
   */
  private noteUltHit(a: SimPlayer | undefined, v: SimPlayer, dmg: number): void {
    if (!a || dmg <= 0) return;
    const el = a.def.ult.element ?? a.def.element;
    const hit: UltHit = { id: a.id, team: a.team, el, x: v.x, y: v.y, v: v.id, tick: this.tick, dmg };
    const window = Math.round(COMBO_WINDOW_SEC * TICK_HZ);
    this.ultHits = this.ultHits.filter((h) => this.tick - h.tick <= window);
    const partner = comboPartner(this.ultHits, hit, window);
    this.ultHits.push(hit);
    if (!partner) return;
    // the pair is spent, so two held ults cannot re-trigger the combo every tick
    this.ultHits = this.ultHits.filter((h) => h !== partner);
    const name = comboName(partner.el, el);
    this.events.push({
      k: 'combo', a: partner.id, b: a.id, v: v.id, n: name, x: Math.round(v.x), y: Math.round(v.y),
    });
    const bonus = dmg * COMBO_BONUS;
    for (const o of this.players.values()) {
      if (o.down || o.burrow) continue;
      // the completer stands in its own blast (melee/self-AoE ults): friendly() only filters
      // crews, and attacker === victim bypasses it, so skip the caster explicitly
      if (o.id === a.id) continue;
      if (Math.hypot(o.x - v.x, o.y - v.y) > COMBO_BURST_RADIUS + o.r) continue;
      // damage() filters crews itself, so the burst never hurts the pair's own side
      this.damage(a.id, o, bonus, o.x, o.y);
    }
  }

  /** Scatter doubloon pickups around a KO'd body (the corpse pays out three coins). */
  private dropCoins(p: SimPlayer, n: number): void {
    this.dropGold(p.x, p.y, n, Math.max(24, p.r + 18));
  }

  /** Scatter `n` gold pickups in a ring around a spot (KO purse, Register Crush). */
  dropGold(x: number, y: number, n: number, ring = 30): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const px = Math.max(24, Math.min(WORLD_W - 24, x + Math.cos(a) * ring));
      const py = Math.max(24, Math.min(WORLD_H - 24, y + Math.sin(a) * ring));
      this.picks.push({ id: this.newProjId(), x: px, y: py, kind: 'gold', left: PICKUP_SEC });
    }
  }

  /** Spawn point maximizing the distance to the nearest living enemy. */
  private spawnFor(p: SimPlayer): { x: number; y: number } {
    const others = [...this.players.values()].filter((o) => o !== p && !o.down);
    const spawns = this.arena.spawns;
    let best = spawns[0];
    let bestD = -1;
    for (const s of spawns) {
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

  /** Purrl (backlog #1) wanders the sand and patches up the first hurt fighter it bumps, once per life. */
  private stepPurrlSnail(dt: number): void {
    stepPurrl(this.purrl, dt, this.arena);
    for (const p of this.players.values()) {
      if (p.down || p.burrow || p.purrlFed || p.hp >= p.mhp) continue;
      if (Math.hypot(p.x - this.purrl.x, p.y - this.purrl.y) > p.r + PURRL_R) continue;
      const before = p.hp;
      p.hp = Math.min(p.mhp, p.hp + PURRL_HEAL);
      p.purrlFed = true;
      this.events.push({
        k: 'purrl', v: p.id, n: Math.round(p.hp - before), x: Math.round(p.x), y: Math.round(p.y),
      });
    }
  }

  private respawnPlayer(p: SimPlayer): void {
    this.applyPendingFighter(p);
    const s = this.spawnFor(p);
    p.x = s.x; p.y = s.y;
    p.hp = p.mhp;
    p.purrlFed = false;
    p.down = false;
    p.ammo = p.def.ammo;
    p.reload = 0;
    p.fireCd = 0;
    p.spcCd = 0;
    p.dash = null;
    p.burrow = null;
    p.buffMul = 1;
    p.buffLeft = 0;
    p.dmgMul = 1;
    p.dmgMulLeft = 0;
    p.status = null;
    p.statusLeft = 0;
    p.trapTook = 0;
    p.shield = C.SHIELD_SEC;
    this.cannonHits.delete(p.id);
    resetOnSpawn(p);
    this.events.push({ k: 'spawn', id: p.id });
  }

  /** Debug ops (server gates these behind ALLOW_DEBUG). */
  debugTeleport(id: number, x: number, y: number): void {
    const p = this.players.get(id);
    if (p && Number.isFinite(x) && Number.isFinite(y)) { p.x = x; p.y = y; resolveWalls(p, this.arena.obstacles); }
  }

  /** Debug: KO a player without an attacker (tests the respawn path). */
  debugKill(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.shield = 0; // spawn shield would otherwise swallow the KO
    this.damage(-1, p, p.hp + 1, p.x, p.y);
  }

  /** Debug shots (`dbg` op `wx`): force this round's weather, e.g. `bubble-storm` (backlog #17). */
  debugWeather(w: string): void {
    if (w === 'clear' || w === 'double-tide' || w === 'bubble-storm' || w === 'jelly-rain') this.setWeather(w);
  }

  debugHp(id: number, hp: number): void {
    const p = this.players.get(id);
    if (p && Number.isFinite(hp)) p.hp = Math.max(1, Math.min(p.mhp, hp));
  }

  /** Debug: jump the tide to the start of a phase (`?tide=high` screenshots). */
  debugTide(phase: string): void {
    if (phase !== 'low' && phase !== 'rising' && phase !== 'high' && phase !== 'falling') return;
    this.tide.force(phase);
    // keep the loot in sync with the jump (`?tide=low` screenshots must show chests)
    this.lootSeeded = false;
    if (phase === 'low') { this.seedChests(); this.lootSeeded = true; } else this.chests = [];
  }

  clearEvents(): void {
    this.events = [];
  }

  /**
   * Emote sticker (T99): purely cosmetic, so it never touches the sim state — it rides along as
   * a snapshot event and every client draws the bubble above that fighter.
   */
  emote(id: number, e: number): void {
    if (!this.players.has(id)) return;
    this.events.push({ k: 'emote', id, e });
  }

  /**
   * New round: clear the scoreboard once the bounty went. The coin stash resets too, so both
   * results screens talk about this round only; positions, HP and live projectiles stay.
   */
  resetScores(): void {
    // the pools are stocked again for the new round (the next step seeds them while the tide is low)
    this.lootSeeded = false;
    // stone walls do not survive the whistle either
    this.walls = [];
    this.summons = [];
    for (const p of this.players.values()) {
      p.kos = 0;
      p.deaths = 0;
      p.bounty = BOUNTY_START;
      p.gold = 0;
      p.carry = 0;
    }
    this.treasure?.reset();
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
      if (viewer && !canSee(viewer, p, hides, this.arena.bushes)) continue;
      players.push({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, mhp: p.mhp,
        f: p.fighter, n: p.name, st: statusMask(p.status),
        a: Math.round((p.aim * 180) / Math.PI),
        am: p.ammo, dn: p.down ? 1 : 0, sh: p.shield > 0 ? 1 : 0, k: p.kos, d: p.deaths, b: p.bounty,
        uc: Math.round(Math.max(0, Math.min(1, p.uc / p.def.ultCharge)) * 100),
        cd: Math.round(p.spcCd * 10) / 10,
        ev: p.evolved ? 1 : undefined,
        tm: p.team ?? undefined,
        ca: this.treasure && p.carry > 0 ? p.carry : undefined,
        sk: p.skin || undefined,
      });
    }
    return {
      t: 'snap', tick: this.tick, ts: Date.now(), ack: this.players.get(viewerId)?.ack ?? 0, players,
      projs: this.projs.map((q) => ({ id: q.id, x: Math.round(q.x), y: Math.round(q.y), o: q.owner })),
      ev: this.events,
      tide: this.tide.info(),
      chests: this.chests.map((c) => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), hp: c.hp, mhp: c.mhp })),
      picks: this.picks.map((k) => ({ id: k.id, x: Math.round(k.x), y: Math.round(k.y), k: k.kind })),
      purrl: {
        x: Math.round(this.purrl.x), y: Math.round(this.purrl.y), a: Math.round((this.purrl.a * 180) / Math.PI),
      },
      cn: this.volleySnap(),
      bb: this.bubbles.length
        ? this.bubbles.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), r: b.r }))
        : undefined,
      jl: this.jellies.length
        ? this.jellies.map((j): SnapJelly => ({ id: j.id, x: Math.round(j.x), y: Math.round(j.y), r: j.r, d: jellyLunging(j) }))
        : undefined,
      tr: this.treasure ? this.treasure.info() : undefined,
      walls: this.walls.length
        ? this.walls.map((w) => ({
          id: w.id, x: Math.round(w.x), y: Math.round(w.y), w: w.w, h: w.h,
          hp: Math.round(w.hp), mhp: w.mhp,
        }))
        : undefined,
      sum: this.summons.length
        ? this.summons.map((s) => ({
          id: s.id, x: Math.round(s.x), y: Math.round(s.y), k: s.kind === 'turret' ? 1 : 0,
          hp: Math.round(s.hp), mhp: s.mhp, o: s.owner,
        }))
        : undefined,
    };
  }
}
