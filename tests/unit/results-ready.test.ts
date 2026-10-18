import { describe, it, expect } from 'vitest';
import type { WebSocket } from 'ws';
import { RoomManager } from '../../server/rooms.ts';
import { resultsFooter, readyLine } from '../../client/src/ui/results.ts';

describe('results ready count (backlog #28)', () => {
  it('tallies Ready taps out of the connected humans', () => {
    const mgr = new RoomManager();
    const a = mgr.join({} as WebSocket, 'rdy-tally', 'A', 'default', 0)!;
    const b = mgr.join({} as WebSocket, 'rdy-tally', 'B', 'default', 0)!;
    const room = a.room;
    room.match.phase = 'results';
    expect(room.readyTally()).toEqual({ ready: 0, of: 2 });
    room.rematch(a.client);
    expect(room.readyTally()).toEqual({ ready: 1, of: 2 });
    room.rematch(b.client);
    expect(room.readyTally()).toEqual({ ready: 2, of: 2 });
  });

  it('a leaver no longer counts, even after tapping Ready', () => {
    const mgr = new RoomManager();
    const a = mgr.join({} as WebSocket, 'rdy-leave', 'A', 'default', 0)!;
    mgr.join({} as WebSocket, 'rdy-leave', 'B', 'default', 0)!;
    const room = a.room;
    room.match.phase = 'results';
    room.rematch(a.client);
    mgr.leave(room, a.client);
    expect(room.readyTally()).toEqual({ ready: 0, of: 1 });
  });

  it('a lone human is 0/1 until they tap', () => {
    const mgr = new RoomManager();
    const { client, room } = mgr.join({} as WebSocket, 'rdy-lone', 'A', 'default', 0)!;
    room.match.phase = 'results';
    expect(room.readyTally()).toEqual({ ready: 0, of: 1 });
    room.rematch(client);
    expect(room.readyTally()).toEqual({ ready: 1, of: 1 });
  });
});

describe('results poster text (backlog #28)', () => {
  it('shows the ready line only when a tally came with the info', () => {
    expect(readyLine({ ready: 2, of: 3 })).toBe('2/3 ready');
    expect(readyLine(undefined)).toBe('');
  });

  it('says "Next round in" only once every human has tapped Ready', () => {
    expect(resultsFooter({ t: 7, rd: { ready: 1, of: 3 } })).toBe(
      'Waiting for everyone to tap Ready · auto-start in 7s',
    );
    expect(resultsFooter({ t: 9, rd: { ready: 3, of: 3 } })).toBe('Next round in 9s');
  });

  it('falls back to the plain countdown without a tally', () => {
    expect(resultsFooter({ t: 4 })).toBe('Next round in 4s');
  });
});
