import { describe, it, expect } from 'vitest';
import type { WebSocket } from 'ws';
import { RoomManager } from '../../server/rooms.ts';

/** A socket that records what the server sends it. */
function socket() {
  const sent: { m?: { host?: boolean } }[] = [];
  const ws = { readyState: 1, send: (s: string) => sent.push(JSON.parse(s)) } as unknown as WebSocket;
  return { ws, sent };
}

describe('room host flag (backlog #27)', () => {
  it('only the first human in the room is flagged as host, and each viewer gets its own flag', () => {
    const mgr = new RoomManager();
    const a = socket();
    const b = socket();
    mgr.join(a.ws, { room: 'host-flag', name: 'A', fighter: 'default', bots: 0 });
    mgr.join(b.ws, { room: 'host-flag', name: 'B', fighter: 'default', bots: 0 });
    mgr.broadcast();
    expect(a.sent[0].m?.host).toBe(true);
    expect(b.sent[0].m?.host).toBe(false);
  });

  it('the host role passes to the next human when the host leaves', () => {
    const mgr = new RoomManager();
    const a = socket();
    const b = socket();
    const first = mgr.join(a.ws, { room: 'host-pass', name: 'A', fighter: 'default', bots: 0 })!;
    mgr.join(b.ws, { room: 'host-pass', name: 'B', fighter: 'default', bots: 0 });
    mgr.leave(first.room, first.client);
    mgr.broadcast();
    const last = b.sent[b.sent.length - 1];
    expect(last.m?.host).toBe(true);
  });

  it('a room with no humans has no host', () => {
    const mgr = new RoomManager();
    const a = mgr.join({} as WebSocket, { room: 'host-none', name: 'A', fighter: 'default', bots: 0 })!;
    mgr.leave(a.room, a.client);
    expect(a.room.hostId()).toBeNull();
  });
});
