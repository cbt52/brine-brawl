import { TICK_HZ } from '../constants.ts';
import { OBSTACLES, SPAWNS } from '../arena/docks.ts';
import type { SnapMsg, SnapPlayer } from '../protocol.ts';
import { resolveWalls, separate } from './collide.ts';

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

  addPlayer(id: number, name: string, fighter = 'default'): SimPlayer {
    const s = SPAWNS[(id - 1) % SPAWNS.length];
    const p: SimPlayer = {
      id, name, fighter, x: s.x, y: s.y, r: PLAYER_RADIUS,
      hp: 100, mhp: 100, speedMul: 1, aim: 0, ack: 0, input: null,
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
  }

  setInput(id: number, input: SimInput): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.input && input.seq < p.input.seq) return;
    p.input = input;
  }

  step(dt = 1 / TICK_HZ): void {
    this.tick++;
    const list = [...this.players.values()];
    for (const p of list) {
      const i = p.input;
      if (!i) continue;
      stepMove(p, i.mx, i.my, BASE_SPEED * p.speedMul, dt);
      if (Number.isFinite(i.ax) && Number.isFinite(i.ay) && (i.ax !== 0 || i.ay !== 0)) p.aim = Math.atan2(i.ay, i.ax);
      p.ack = i.seq;
    }
    separate(list);
    for (const p of list) resolveWalls(p, OBSTACLES);
  }

  snapshotFor(viewerId: number): SnapMsg {
    const players: SnapPlayer[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, mhp: p.mhp,
        f: p.fighter, n: p.name, st: 0, a: Math.round((p.aim * 180) / Math.PI),
      });
    }
    return { t: 'snap', tick: this.tick, ts: Date.now(), ack: this.players.get(viewerId)?.ack ?? 0, players, projs: [], ev: [] };
  }
}
