import type { WebSocket } from 'ws';
import { MAX_HUMANS, MAX_NAME_LEN, TICK_HZ } from '../shared/constants.ts';
import type { InputMsg } from '../shared/protocol.ts';
import { World } from '../shared/sim/world.ts';

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
}

export class Room {
  clients = new Map<number, Client>();
  world = new World();
  emptySince: number | null = Date.now();
  acc = 0;
  last = Date.now();
  constructor(public id: string) {}

  /** Advance the sim by wall-clock time using a fixed 30 Hz step. */
  advance(now: number): number {
    this.acc = Math.min(this.acc + (now - this.last) / 1000, 0.25);
    this.last = now;
    const dt = 1 / TICK_HZ;
    let n = 0;
    while (this.acc >= dt) { this.world.step(dt); this.acc -= dt; n++; }
    return n;
  }

  setInput(c: Client, i: InputMsg): void {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    this.world.setInput(c.id, {
      seq: n(i.seq), mx: n(i.mx), my: n(i.my), ax: n(i.ax), ay: n(i.ay),
      atk: !!i.atk, spc: !!i.spc, ult: !!i.ult,
    });
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
    };
    room.clients.set(cid, client);
    room.world.addPlayer(cid, client.name, client.fighter);
    room.emptySince = null;
    return { room, client };
  }

  leave(room: Room, client: Client): void {
    room.clients.delete(client.id);
    room.world.removePlayer(client.id);
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
      r.advance(Date.now());
      for (const c of r.clients.values()) {
        if (c.ws.readyState === 1) c.ws.send(JSON.stringify(r.world.snapshotFor(c.id)));
      }
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
