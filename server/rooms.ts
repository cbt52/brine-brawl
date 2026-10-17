import type { WebSocket } from 'ws';
import { MAX_HUMANS, MAX_NAME_LEN } from '../shared/constants.ts';
import type { InputMsg, SnapMsg, SnapPlayer } from '../shared/protocol.ts';

const ROOM_RE = /^[a-z0-9-]{1,24}$/;
const ADJ = ['Salty', 'Soggy', 'Crispy', 'Wobbly', 'Grumpy', 'Sneaky', 'Bouncy', 'Dizzy'];
const NOUN = ['Biscuit', 'Barnacle', 'Pickle', 'Noodle', 'Clam', 'Muffin', 'Kelp', 'Crumb'];

export function sanitizeRoom(raw: unknown): string {
  return typeof raw === 'string' && ROOM_RE.test(raw) ? raw : 'main';
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, MAX_NAME_LEN).trim() : '';
  if (s) return s;
  const r = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return `${r(ADJ)} ${r(NOUN)}`;
}

export interface Client {
  id: number;
  ws: WebSocket;
  name: string;
  fighter: string;
  x: number;
  y: number;
  input: InputMsg | null;
}

export class Room {
  clients = new Map<number, Client>();
  tick = 0;
  emptySince: number | null = Date.now();
  constructor(public id: string) {}

  snapshot(): SnapMsg {
    const players: SnapPlayer[] = [];
    for (const c of this.clients.values()) {
      players.push({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), hp: 100, mhp: 100, f: c.fighter, n: c.name, st: 0 });
    }
    return { t: 'snap', tick: this.tick, ts: Date.now(), players, projs: [], ev: [] };
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  private nextId = 1;
  private timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => this.sweep(), 5000);
    this.timer.unref();
  }

  join(ws: WebSocket, roomRaw: unknown, nameRaw: unknown, fighterRaw: unknown): { room: Room; client: Client } | null {
    const id = sanitizeRoom(roomRaw);
    let room = this.rooms.get(id);
    if (!room) {
      room = new Room(id);
      this.rooms.set(id, room);
    }
    if (room.clients.size >= MAX_HUMANS) return null;
    const cid = this.nextId++;
    const client: Client = {
      id: cid,
      ws,
      name: sanitizeName(nameRaw),
      fighter: typeof fighterRaw === 'string' ? fighterRaw.slice(0, 24) : 'default',
      x: 600 + (cid % 8) * 150,
      y: 800,
      input: null,
    };
    room.clients.set(cid, client);
    room.emptySince = null;
    return { room, client };
  }

  leave(room: Room, client: Client): void {
    room.clients.delete(client.id);
    if (room.clients.size === 0) room.emptySince = Date.now();
  }

  sweep(now = Date.now()): void {
    for (const [id, r] of this.rooms) {
      if (r.emptySince !== null && now - r.emptySince > 30_000) this.rooms.delete(id);
    }
  }

  broadcast(): void {
    for (const r of this.rooms.values()) {
      if (r.clients.size === 0) continue;
      r.tick++;
      const msg = JSON.stringify(r.snapshot());
      for (const c of r.clients.values()) if (c.ws.readyState === 1) c.ws.send(msg);
    }
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += r.clients.size;
    return { rooms: this.rooms.size, players };
  }

  close(): void {
    clearInterval(this.timer);
  }
}
