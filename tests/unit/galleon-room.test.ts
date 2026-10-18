import { describe, it, expect } from 'vitest';
import type { WebSocket } from 'ws';
import { Room, RoomManager } from '../../server/rooms.ts';
import { DOCKS_ARENA, GALLEON_ARENA } from '../../shared/arena/arena.ts';

// join() only stores the socket and never writes to it here, so a null socket is enough
const ws = null as unknown as WebSocket;

/** join(ws, room, name, fighter, bots, matchSec, tide, mode, level, skin, arena) */
const join = (rooms: RoomManager, room: string, arena?: unknown) =>
  rooms.join(ws, room, 'Tester', 'default', 0, undefined, undefined, undefined, undefined, undefined, arena);

describe('room arena pick (backlog #26)', () => {
  it('a room is built on the arena it was created with', () => {
    expect(new Room('r').world.arena).toBe(DOCKS_ARENA);
    expect(new Room('r', 'bounty', GALLEON_ARENA).world.arena).toBe(GALLEON_ARENA);
  });

  it('a new room takes the arena from the join message', () => {
    const rooms = new RoomManager();
    expect(join(rooms, 'deck-room', 'galleon')?.room.world.arena.id).toBe('galleon');
  });

  it('a missing or unknown arena plays on the docks', () => {
    const rooms = new RoomManager();
    expect(join(rooms, 'docks-a')?.room.world.arena.id).toBe('docks');
    expect(join(rooms, 'docks-b', 'lagoon')?.room.world.arena.id).toBe('docks');
    expect(join(rooms, 'docks-c', 42)?.room.world.arena.id).toBe('docks');
  });

  it('an existing room keeps its layout when a later join asks for another', () => {
    const rooms = new RoomManager();
    const deck = join(rooms, 'deck-kept', 'galleon');
    expect(join(rooms, 'deck-kept', 'docks')?.room).toBe(deck?.room);
    expect(deck?.room.world.arena.id).toBe('galleon');
    const docks = join(rooms, 'docks-kept');
    expect(join(rooms, 'docks-kept', 'galleon')?.room.world.arena.id).toBe('docks');
    expect(docks?.room.world.arena.id).toBe('docks');
  });

  it('the Galleon room spawns its fighters on the deck', () => {
    const rooms = new RoomManager();
    const j = join(rooms, 'deck-spawn', 'galleon');
    const p = j?.room.world.players.get(j.client.id);
    expect(GALLEON_ARENA.spawns.some((s) => s.x === p?.x && s.y === p?.y)).toBe(true);
  });
});
