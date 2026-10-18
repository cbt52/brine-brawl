export const PROTOCOL_VERSION = 1;

export interface InputMsg {
  t: 'in';
  seq: number;
  mx: number;
  my: number;
  ax: number;
  ay: number;
  atk: boolean;
  spc: boolean;
  ult: boolean;
}

export interface JoinMsg {
  t: 'join';
  room?: string;
  name?: string;
  fighter?: string;
  bots?: number;
  /** room mode picked in the lobby (T26); defaults to bounty */
  mode?: string;
  /** match length override in seconds — ALLOW_DEBUG servers only */
  matchsec?: number;
  /** jump the tide to a phase (`?tide=high` screenshots) — ALLOW_DEBUG servers only */
  tide?: string;
}

/** Match phases: waiting for players → 3 s countdown → playing → results → countdown… */
export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'results';

/** Room mode (T26): Bounty Brawl or Treasure Tide (the chest objective arrives in T27). */
export type RoomMode = 'bounty' | 'treasure';

/** One scoreboard row (sent in the results phase). */
export interface ScoreRow {
  id: number;
  n: string;
  k: number;
  d: number;
  /** bounty in doubloons — the Bounty Brawl score (T19) */
  b: number;
  /** fighter id, so the results poster can draw the portrait */
  f: string;
  /** 1 = bot */
  bot: number;
  /** crew 0/1 when the match runs teams; absent in a free-for-all */
  tm?: number;
}

export interface MatchInfo {
  /** phase */
  st: MatchPhase;
  /** whole seconds left in the current phase */
  t: number;
  /** round counter, increments when a match starts */
  r: number;
  /** final ranking — results phase only */
  res?: ScoreRow[];
  /** every combatant (id/name/kos/deaths), unfiltered — the scoreboard uses this because the
   * snapshot `players` list hides fighters behind kelp */
  ros?: ScoreRow[];
  /** room mode (bounty / treasure) — HUD + scoreboard label */
  mode?: RoomMode;
}

export interface DbgMsg {
  t: 'dbg';
  op: string;
  [k: string]: unknown;
}

export interface BotsMsg {
  t: 'bots';
  n: number;
}

/** Change your fighter; it takes effect on the next respawn (no debug flag needed). */
export interface PickMsg {
  t: 'pick';
  fighter: string;
}

export type C2S = JoinMsg | InputMsg | DbgMsg | BotsMsg | PickMsg | { t: 'ping'; ts?: number };

export interface SnapPlayer {
  id: number;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  f: string;
  n: string;
  st: number;
  /** aim angle in degrees */
  a: number;
  /** ammo */
  am: number;
  /** 1 = down (KO'd, waiting to respawn) */
  dn: number;
  /** 1 = spawn shield active */
  sh: number;
  k: number;
  d: number;
  /** bounty in doubloons (Bounty Brawl score) */
  b: number;
  /** ult charge in percent (0-100) */
  uc: number;
  /** 1 = evolved (Critterkin EVOLVE passive, T20) */
  ev?: number;
  /** crew 0/1 when the match runs teams (T26); absent in a free-for-all */
  tm?: number;
  /** special cooldown remaining in seconds */
  cd: number;
}

export interface SnapProj {
  id: number;
  x: number;
  y: number;
  /** owner player id */
  o: number;
}

/** Rising tide phases (design §2.10). */
export type TidePhase = 'low' | 'rising' | 'high' | 'falling';

export interface TideInfo {
  phase: TidePhase;
  /** whole seconds left in this phase */
  t: number;
  /** flood level 0..1 (drives the water overlay, chests hiding and the wade slow-down) */
  level: number;
}

/** A low-tide treasure chest (destructible, drops one pickup). */
export interface SnapChest {
  id: number;
  x: number;
  y: number;
  hp: number;
  mhp: number;
}

export type PickupKind = 'heal' | 'ult' | 'gold';

/** A temporary stone wall (Brak's Stone Wall, T22): blocks bodies and shots. */
export interface SnapWall {
  id: number;
  x: number;
  y: number;
  /** footprint, so the client draws the slab exactly on the collision rect */
  w: number;
  h: number;
  hp: number;
  mhp: number;
}

/** A reward dropped by a broken chest. */
export interface SnapPickup {
  id: number;
  x: number;
  y: number;
  k: PickupKind;
}

export type AbilitySlot = 'attack' | 'special' | 'ult';

export type SimEvent =
  | { k: 'shot'; id: number; x: number; y: number; a: number }
  | { k: 'hit'; a: number; v: number; dmg: number; x: number; y: number }
  | { k: 'ko'; a: number; v: number; /** doubloons the killer collected (bounty mode) */ pay?: number }
  | { k: 'spawn'; id: number }
  /** an ability was cast (cosmetic hook for the FX + audio passes); `slot` lets the client pick ult sfx */
  | { k: 'cast'; id: number; ab: string; x: number; y: number; a: number; slot?: AbilitySlot }
  /** a status landed on a victim (`sec` 0 = it was cleared) */
  | { k: 'status'; v: number; s: string; sec: number }
  /** two elements reacted on a victim (shock/steam/flare/mud/wildfire/thunderclap) */
  | { k: 'react'; v: number; r: string; x: number; y: number }
  /** a treasure chest broke open */
  | { k: 'chest'; x: number; y: number }
  /** somebody grabbed a dropped reward */
  | { k: 'pick'; id: number; kind: PickupKind; x: number; y: number }
  /** a faction passive fired (T20); `a` = the other fighter for PLUNDER */
  | { k: 'passive'; v: number; p: 'evolve' | 'flow' | 'plunder' | 'toon'; x: number; y: number; a?: number }
  /** a stone wall crumbled (T22) */
  | { k: 'wall'; x: number; y: number };

export interface SnapMsg {
  t: 'snap';
  tick: number;
  ts: number;
  /** last processed input seq for the receiving client */
  ack: number;
  players: SnapPlayer[];
  projs: SnapProj[];
  ev: SimEvent[];
  /** rising-tide state */
  tide?: TideInfo;
  /** low-tide treasure */
  chests?: SnapChest[];
  /** unclaimed chest rewards */
  picks?: SnapPickup[];
  /** standing stone walls (T22) */
  walls?: SnapWall[];
  /** match phase + timer (added by the room) */
  m?: MatchInfo;
}

export type S2C =
  | { t: 'welcome'; id: number; room: string; build: string; tick: number }
  | SnapMsg
  | { t: 'pong'; ts?: number }
  | { t: 'err'; msg: string };
