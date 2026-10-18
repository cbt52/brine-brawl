import { describe, it, expect } from 'vitest';
import { Room } from '../../server/rooms.ts';
import { World } from '../../shared/sim/world.ts';
import { lastSideIds, SHOWDOWN_CENTER, SHOWDOWN_START_SEC, type RingBody } from '../../shared/sim/showdown.ts';
import { lastStandLine } from '../../client/src/ui/results.ts';

const { x: cx, y: cy } = SHOWDOWN_CENTER;
/** well past the ring's start, so the ring is closing */
const T = SHOWDOWN_START_SEC + 60;
const INSIDE = { x: cx, y: cy };
const OUTSIDE = { x: 20, y: 20 };

function body(id: number, team: number | null, spot = INSIDE, down = false): RingBody {
  return { id, team: team as RingBody['team'], x: spot.x, y: spot.y, down };
}

describe('last-standing side (backlog #33)', () => {
  it('lists the fighters of the one side still standing inside the ring', () => {
    expect(lastSideIds([body(1, 0), body(2, 0), body(3, 1, OUTSIDE)], T)).toEqual([1, 2]);
    expect(lastSideIds([body(1, null), body(2, null, OUTSIDE)], T)).toEqual([1]);
  });

  it('skips downed fighters', () => {
    expect(lastSideIds([body(1, 0), body(2, 1, INSIDE, true)], T)).toEqual([1]);
  });

  it('is empty while two sides still stand, or before the ring closes', () => {
    expect(lastSideIds([body(1, 0), body(2, 1)], T)).toEqual([]);
    expect(lastSideIds([body(1, 0), body(2, 0)], SHOWDOWN_START_SEC)).toEqual([]);
  });
});

describe('last-standing label (backlog #33)', () => {
  it('names the crew that is left in a crew match', () => {
    const w = new World();
    w.setMode('showdown');
    w.addPlayer(1, 'A', 'default', false, 0);
    w.addPlayer(2, 'B', 'default', false, 1);
    w.addPlayer(3, 'C', 'default', false, 1);
    for (const id of [1, 2, 3]) Object.assign(w.players.get(id)!, { x: cx, y: cy });
    w.setRoundT(T);
    expect(w.lastStandingLabel()).toBeNull();
    w.players.get(1)!.down = true;
    expect(w.lastStandingLabel()).toBe('CREW B');
  });

  it('names the lone fighter in a free-for-all', () => {
    const w = new World();
    w.setMode('showdown');
    w.addPlayer(1, 'Tester', 'default', false, null);
    w.addPlayer(2, 'Rival', 'default', false, null);
    Object.assign(w.players.get(1)!, { x: cx, y: cy });
    Object.assign(w.players.get(2)!, { x: 20, y: 20 });
    w.setRoundT(T);
    expect(w.lastStandingLabel()).toBe('Tester');
  });

  it('is null outside Showdown', () => {
    const w = new World();
    w.setMode('bounty');
    w.addPlayer(1, 'A', 'default', false, null);
    w.setRoundT(T);
    expect(w.lastStandingLabel()).toBeNull();
  });
});

describe('results banner (backlog #33)', () => {
  it('reads "LAST STANDING" with the winning side only when the ring ended the round', () => {
    expect(lastStandLine('CREW A')).toBe('LAST STANDING · CREW A');
    expect(lastStandLine('Tester')).toBe('LAST STANDING · Tester');
    expect(lastStandLine(undefined)).toBe('');
  });
});

describe('room keeps the last-standing side for the results (backlog #33)', () => {
  it('a Showdown ring finish records the crew, and a clock finish records nothing', () => {
    const room = new Room('ls-room', 'showdown');
    room.world.addPlayer(1, 'A', 'default', false, 0);
    room.world.addPlayer(2, 'B', 'default', false, 1);
    room.world.addPlayer(3, 'C', 'default', false, 0);
    for (const id of [1, 2, 3]) Object.assign(room.world.players.get(id)!, { x: cx, y: cy });
    room.world.players.get(2)!.down = true;
    room.match.phase = 'playing';
    room.match.timer = room.match.cfg.matchSec - T;
    room.advance(room.last + 100);
    expect(room.match.phase).toBe('results');
    expect(room.lastStand).toBe('CREW A');
  });

  it('a round that runs out its clock has no last-standing side', () => {
    const room = new Room('ls-clock', 'showdown');
    room.match.phase = 'playing';
    room.match.timer = 0.05;
    room.advance(room.last + 100);
    expect(room.match.phase).toBe('results');
    expect(room.lastStand).toBeNull();
  });
});
