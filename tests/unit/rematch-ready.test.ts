import { describe, it, expect } from 'vitest';
import type { WebSocket } from 'ws';
import { RoomManager } from '../../server/rooms.ts';
import { Match, READY_HOLD_SEC } from '../../server/match.ts';

describe('results Ready taps (backlog #15)', () => {
  it('holds the results for READY_HOLD_SEC once the last human taps Ready, and never shortens the wait', () => {
    const m = new Match();
    m.phase = 'results';
    m.timer = 3;
    m.holdResults(READY_HOLD_SEC);
    expect(m.timer).toBe(READY_HOLD_SEC);
    m.timer = 15;
    m.holdResults(READY_HOLD_SEC);
    expect(m.timer).toBe(15);
  });

  it('does nothing outside the results screen', () => {
    const m = new Match();
    m.phase = 'playing';
    m.timer = 40;
    m.holdResults(READY_HOLD_SEC);
    expect(m.timer).toBe(40);
  });

  it('a lone human taps Ready → the round restarts 10 s later', () => {
    const mgr = new RoomManager();
    const { client, room } = mgr.join({} as WebSocket, { room: 'rdy-solo', name: 'A', fighter: 'default', bots: 0 })!;
    room.match.phase = 'results';
    room.match.timer = 2;
    expect(room.rematch(client)).toBe(true);
    expect(room.match.timer).toBe(READY_HOLD_SEC);
  });

  it('waits for every human: the first Ready tap leaves the normal results wait alone', () => {
    const mgr = new RoomManager();
    const a = mgr.join({} as WebSocket, { room: 'rdy-pair', name: 'A', fighter: 'default', bots: 0 })!;
    const b = mgr.join({} as WebSocket, { room: 'rdy-pair', name: 'B', fighter: 'default', bots: 0 })!;
    const room = a.room;
    room.match.phase = 'results';
    room.match.timer = 5;
    expect(room.rematch(a.client)).toBe(false);
    expect(room.match.timer).toBe(5);
    expect(room.rematch(b.client)).toBe(true);
    expect(room.match.timer).toBe(READY_HOLD_SEC);
  });

  it('a repeat Ready tap from the same human does not push the round start back', () => {
    const mgr = new RoomManager();
    const { client, room } = mgr.join({} as WebSocket, { room: 'rdy-repeat', name: 'A', fighter: 'default', bots: 0 })!;
    room.match.phase = 'results';
    room.match.timer = 2;
    expect(room.rematch(client)).toBe(true);
    expect(room.match.timer).toBe(READY_HOLD_SEC);
    room.match.timer = 4;
    expect(room.rematch(client)).toBe(false);
    expect(room.match.timer).toBe(4);
  });

  it('a Ready tap outside the results screen is ignored', () => {
    const mgr = new RoomManager();
    const { client, room } = mgr.join({} as WebSocket, { room: 'rdy-playing', name: 'A', fighter: 'default', bots: 0 })!;
    room.match.phase = 'playing';
    room.match.timer = 40;
    expect(room.rematch(client)).toBe(false);
    expect(room.match.timer).toBe(40);
  });
});
