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

export type C2S = JoinMsg | InputMsg | DbgMsg | BotsMsg | { t: 'ping'; ts?: number };

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
}

export interface SnapProj {
  id: number;
  x: number;
  y: number;
  /** owner player id */
  o: number;
}

export type SimEvent =
  | { k: 'shot'; id: number; x: number; y: number; a: number }
  | { k: 'hit'; a: number; v: number; dmg: number; x: number; y: number }
  | { k: 'ko'; a: number; v: number }
  | { k: 'spawn'; id: number };

export interface SnapMsg {
  t: 'snap';
  tick: number;
  ts: number;
  /** last processed input seq for the receiving client */
  ack: number;
  players: SnapPlayer[];
  projs: SnapProj[];
  ev: SimEvent[];
}

export type S2C =
  | { t: 'welcome'; id: number; room: string; build: string; tick: number }
  | SnapMsg
  | { t: 'pong'; ts?: number }
  | { t: 'err'; msg: string };
