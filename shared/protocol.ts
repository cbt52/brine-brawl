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

export type C2S = JoinMsg | InputMsg | DbgMsg | { t: 'ping'; ts?: number };

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
}

export interface SnapMsg {
  t: 'snap';
  tick: number;
  ts: number;
  /** last processed input seq for the receiving client */
  ack: number;
  players: SnapPlayer[];
  projs: unknown[];
  ev: unknown[];
}

export type S2C =
  | { t: 'welcome'; id: number; room: string; build: string; tick: number }
  | SnapMsg
  | { t: 'pong'; ts?: number }
  | { t: 'err'; msg: string };
