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
  /** bot level picked in the lobby (T99): easy / normal / sharky; defaults to normal */
  level?: string;
  /** match length override in seconds — ALLOW_DEBUG servers only */
  matchsec?: number;
  /** jump the tide to a phase (`?tide=high` screenshots) — ALLOW_DEBUG servers only */
  tide?: string;
  /** skin index from the select screen (backlog #3): 0 = drawn look, see shared/skins.ts */
  skin?: number;
}

/** Match phases: waiting for players → 3 s countdown → playing → results → countdown… */
export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'results';

/** Room mode (T26): Bounty Brawl, Treasure Tide (T27) or Showdown (backlog #6, the closing ring). */
export type RoomMode = 'bounty' | 'treasure' | 'showdown';

/** Weird Weather (backlog #4): the modifier a round rolls when it starts. */
export type Weather = 'clear' | 'double-tide' | 'bubble-storm';

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
  /** skin index (shared/skins.ts) so the WANTED poster matches the body; absent = the drawn look */
  sk?: number;
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
  /** this round's Weird Weather modifier (backlog #4) — HUD tag */
  wx?: Weather;
  /** Showdown only (backlog #6): seconds into the round, drives the ring and its HUD timer */
  sd?: number;
  /** bot level of this room (backlog #14): easy / normal / sharky — the ☰ menu highlights it */
  bl?: string;
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

/** Host switches the bot level for the bots in the room (backlog #14): easy / normal / sharky. */
export interface BotLevelMsg {
  t: 'botlevel';
  level: string;
}

/** Change your fighter; it takes effect on the next respawn (no debug flag needed). */
export interface PickMsg {
  t: 'pick';
  fighter: string;
}

/** Change your skin from the ☰ menu (backlog #16); cosmetic, it shows on the next snapshot. */
export interface SkinMsg {
  t: 'skin';
  skin: number;
}

/** Send an emote sticker (T99); `e` is an index into shared/emotes.ts EMOTES. */
export interface EmoteMsg {
  t: 'emote';
  e: number;
}

export type C2S =
  | JoinMsg
  | InputMsg
  | DbgMsg
  | BotsMsg
  | BotLevelMsg
  | PickMsg
  | SkinMsg
  | EmoteMsg
  /** results screen "Rematch" = Ready tap (T28, backlog #15): the next round starts once everyone has tapped */
  | { t: 'rematch' }
  | { t: 'ping'; ts?: number };

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
  /** doubloons carried on the body in Treasure Tide (T27) */
  ca?: number;
  /** special cooldown remaining in seconds */
  cd: number;
  /** skin index (shared/skins.ts); absent = the drawn look */
  sk?: number;
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

/** Treasure Tide (T27): crew coin totals at the sunken chest plus the escape countdown. */
export interface TreasureInfo {
  /** coins carried by crew A / crew B */
  a: number;
  b: number;
  /** seconds left on the escape countdown (0 = none running) */
  cd: number;
  /** crew the countdown belongs to, null when idle */
  cdTeam: 0 | 1 | null;
}

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

/** A decoy or turret standing in the arena (T31). */
export interface SnapSummon {
  id: number;
  x: number;
  y: number;
  /** 0 = decoy, 1 = turret */
  k: 0 | 1;
  hp: number;
  mhp: number;
  /** owner player id */
  o: number;
}

/** Purrl, the wandering sea snail (backlog #1): where it is and which way it faces (degrees). */
export interface SnapPurrl {
  x: number;
  y: number;
  a: number;
}

/** A bubble of the bubble storm (backlog #17); fighters inside it are carried up and slowed. */
export interface SnapBubble {
  id: number;
  x: number;
  y: number;
  r: number;
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
  | { k: 'wall'; x: number; y: number }
  /** a teammate was patched up (Remedy Dart, Field Surgery; T31) */
  | { k: 'heal'; v: number; n: number; x: number; y: number }
  /** Purrl patched a hurt fighter up (backlog #25); x/y = that fighter, so the bubble ring and pop sit on them */
  | { k: 'purrl'; v: number; n: number; x: number; y: number }
  /** two teammates' ults paired up into a Crew Combo (T28) */
  | { k: 'combo'; a: number; b: number; v: number; n: string; x: number; y: number }
  /** somebody sent a sticker (T99); `e` is an index into EMOTES (shared/emotes.ts) */
  | { k: 'emote'; id: number; e: number };

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
  /** standing decoys and turrets (T31) */
  sum?: SnapSummon[];
  /** Purrl, the sea snail that heals once per life (backlog #1) */
  purrl?: SnapPurrl;
  /** bubble storm bubbles, only in a bubble-storm round (backlog #17) */
  bb?: SnapBubble[];
  /** Treasure Tide crew totals + escape countdown (T27) */
  tr?: TreasureInfo;
  /** match phase + timer (added by the room) */
  m?: MatchInfo;
}

export type S2C =
  | { t: 'welcome'; id: number; room: string; build: string; tick: number }
  | SnapMsg
  | { t: 'pong'; ts?: number }
  | { t: 'err'; msg: string };
