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
  /** match length override in seconds — ALLOW_DEBUG servers only */
  matchsec?: number;
}

/** Match phases: waiting for players → 3 s countdown → playing → results → countdown… */
export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'results';

/** One scoreboard row (sent in the results phase). */
export interface ScoreRow {
  id: number;
  n: string;
  k: number;
  d: number;
  /** 1 = bot */
  bot: number;
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
  /** ult charge in percent (0-100) */
  uc: number;
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

export type AbilitySlot = 'attack' | 'special' | 'ult';

export type SimEvent =
  | { k: 'shot'; id: number; x: number; y: number; a: number }
  | { k: 'hit'; a: number; v: number; dmg: number; x: number; y: number }
  | { k: 'ko'; a: number; v: number }
  | { k: 'spawn'; id: number }
  /** an ability was cast (cosmetic hook for the FX + audio passes); `slot` lets the client pick ult sfx */
  | { k: 'cast'; id: number; ab: string; x: number; y: number; a: number; slot?: AbilitySlot }
  /** a status landed on a victim */
  | { k: 'status'; v: number; s: string; sec: number };

export interface SnapMsg {
  t: 'snap';
  tick: number;
  ts: number;
  /** last processed input seq for the receiving client */
  ack: number;
  players: SnapPlayer[];
  projs: SnapProj[];
  ev: SimEvent[];
  /** match phase + timer (added by the room) */
  m?: MatchInfo;
}

export type S2C =
  | { t: 'welcome'; id: number; room: string; build: string; tick: number }
  | SnapMsg
  | { t: 'pong'; ts?: number }
  | { t: 'err'; msg: string };
