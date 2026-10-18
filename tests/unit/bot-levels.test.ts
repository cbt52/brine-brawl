import { describe, it, expect } from 'vitest';
import { BOT_LEVELS, BOT_PARAMS, sanitizeBotLevel } from '../../shared/sim/bot.ts';
import { RoomManager } from '../../server/rooms.ts';
import type { WebSocket } from 'ws';

describe('bot levels (T99)', () => {
  it('offers easy, normal and sharky in that order', () => {
    expect(BOT_LEVELS).toEqual(['easy', 'normal', 'sharky']);
  });

  it('sharky aims tighter and reacts faster than normal, which beats easy', () => {
    expect(BOT_PARAMS.sharky.errDeg).toBeLessThan(BOT_PARAMS.normal.errDeg);
    expect(BOT_PARAMS.normal.errDeg).toBeLessThan(BOT_PARAMS.easy.errDeg);
    expect(BOT_PARAMS.sharky.react).toBeLessThan(BOT_PARAMS.normal.react);
    expect(BOT_PARAMS.normal.react).toBeLessThan(BOT_PARAMS.easy.react);
  });

  it('sanitizes unknown or missing levels to normal', () => {
    expect(sanitizeBotLevel('sharky')).toBe('sharky');
    expect(sanitizeBotLevel('easy')).toBe('easy');
    expect(sanitizeBotLevel('insane')).toBe('normal');
    expect(sanitizeBotLevel(undefined)).toBe('normal');
    expect(sanitizeBotLevel(3)).toBe('normal');
  });

  it('the first human picks the level for the bots their room spawns', () => {
    const mgr = new RoomManager();
    mgr.join({} as WebSocket, { room: 'lvl-sharky', name: 'A', fighter: 'default', bots: 2, level: 'sharky' });
    const room = mgr.rooms.get('lvl-sharky')!;
    expect(room.botLevel).toBe('sharky');
    expect(room.bots.size).toBe(2);
    mgr.join({} as WebSocket, { room: 'lvl-default', name: 'A', fighter: 'default', bots: 1 });
    expect(mgr.rooms.get('lvl-default')!.botLevel).toBe('normal');
  });

  it('the host switches the level and the bots already in the room switch with it (backlog #14)', () => {
    const mgr = new RoomManager();
    mgr.join({} as WebSocket, { room: 'lvl-switch', name: 'A', fighter: 'default', bots: 2, level: 'normal' });
    const room = mgr.rooms.get('lvl-switch')!;
    room.setBotLevel('sharky');
    expect(room.botLevel).toBe('sharky');
    for (const b of room.bots.values()) expect(b.difficulty).toBe('sharky');
    // a bot added later spawns on the new level too
    room.wantBots = 3;
    room.syncBots();
    expect(room.bots.size).toBe(3);
    for (const b of room.bots.values()) expect(b.difficulty).toBe('sharky');
  });

  it('an unknown level from the menu falls back to normal', () => {
    const mgr = new RoomManager();
    mgr.join({} as WebSocket, { room: 'lvl-junk', name: 'A', fighter: 'default', bots: 1, level: 'easy' });
    const room = mgr.rooms.get('lvl-junk')!;
    room.setBotLevel('insane');
    expect(room.botLevel).toBe('normal');
    for (const b of room.bots.values()) expect(b.difficulty).toBe('normal');
  });

  it('the match info sent to every client carries the room level for the ☰ menu', () => {
    const mgr = new RoomManager();
    const sent: { m?: { bl?: string } }[] = [];
    const ws = { readyState: 1, send: (s: string) => sent.push(JSON.parse(s)) } as unknown as WebSocket;
    mgr.join(ws, { room: 'lvl-info', name: 'A', fighter: 'default', bots: 1, level: 'easy' });
    mgr.rooms.get('lvl-info')!.setBotLevel('sharky');
    mgr.broadcast();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].m?.bl).toBe('sharky');
  });

  it('a later joiner cannot change the level of a room already in play', () => {
    const mgr = new RoomManager();
    mgr.join({} as WebSocket, { room: 'lvl-keep', name: 'A', fighter: 'default', bots: 0, level: 'easy' });
    mgr.join({} as WebSocket, { room: 'lvl-keep', name: 'B', fighter: 'default', bots: 0, level: 'sharky' });
    expect(mgr.rooms.get('lvl-keep')!.botLevel).toBe('easy');
  });
});
