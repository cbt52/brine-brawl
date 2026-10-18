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
    mgr.join({} as WebSocket, 'lvl-sharky', 'A', 'default', 2, undefined, undefined, undefined, 'sharky');
    const room = mgr.rooms.get('lvl-sharky')!;
    expect(room.botLevel).toBe('sharky');
    expect(room.bots.size).toBe(2);
    mgr.join({} as WebSocket, 'lvl-default', 'A', 'default', 1);
    expect(mgr.rooms.get('lvl-default')!.botLevel).toBe('normal');
  });

  it('a later joiner cannot change the level of a room already in play', () => {
    const mgr = new RoomManager();
    mgr.join({} as WebSocket, 'lvl-keep', 'A', 'default', 0, undefined, undefined, undefined, 'easy');
    mgr.join({} as WebSocket, 'lvl-keep', 'B', 'default', 0, undefined, undefined, undefined, 'sharky');
    expect(mgr.rooms.get('lvl-keep')!.botLevel).toBe('easy');
  });
});
