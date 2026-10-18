import { describe, it, expect } from 'vitest';
import {
  SHOWDOWN_START_SEC,
  SHOWDOWN_SHRINK_SEC,
  SHOWDOWN_FULL_R,
  SHOWDOWN_MIN_R,
  SHOWDOWN_CENTER,
  SHOWDOWN_EDGE_DPS,
  shrinkFrac,
  showdownTideLevel,
  safeRadius,
  outsideRing,
  edgeDamage,
  lastSideInRing,
} from '../../shared/sim/showdown.ts';

const END = SHOWDOWN_START_SEC + SHOWDOWN_SHRINK_SEC;

describe('showdown ring timing', () => {
  it('the ring is still full during the grace period', () => {
    expect(shrinkFrac(0)).toBe(0);
    expect(shrinkFrac(SHOWDOWN_START_SEC)).toBe(0);
    expect(safeRadius(SHOWDOWN_START_SEC)).toBe(SHOWDOWN_FULL_R);
  });

  it('shrinks linearly to the minimum, then stops', () => {
    expect(shrinkFrac(SHOWDOWN_START_SEC + SHOWDOWN_SHRINK_SEC / 2)).toBeCloseTo(0.5);
    expect(shrinkFrac(END)).toBe(1);
    expect(shrinkFrac(END + 60)).toBe(1);
    expect(safeRadius(END)).toBe(SHOWDOWN_MIN_R);
    expect(safeRadius(END + 999)).toBe(SHOWDOWN_MIN_R);
  });

  it('the radius never grows as the round goes on', () => {
    let prev = Infinity;
    for (let t = 0; t <= END + 30; t += 1) {
      const r = safeRadius(t);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });

  it('the tide rises with the ring', () => {
    expect(showdownTideLevel(0)).toBe(0);
    expect(showdownTideLevel(END)).toBe(1);
    expect(showdownTideLevel(SHOWDOWN_START_SEC + SHOWDOWN_SHRINK_SEC / 2)).toBeCloseTo(0.5);
  });

  it('bad clock values count as the grace period', () => {
    expect(shrinkFrac(NaN)).toBe(0);
    expect(shrinkFrac(-5)).toBe(0);
  });
});

describe('showdown ring geometry', () => {
  const { x: cx, y: cy } = SHOWDOWN_CENTER;

  it('the centre is inside the ring at every time', () => {
    expect(outsideRing(cx, cy, 0)).toBe(false);
    expect(outsideRing(cx, cy, END)).toBe(false);
  });

  it('a point just inside the full ring is safe early, outside once it has closed', () => {
    const x = cx + SHOWDOWN_FULL_R - 5;
    expect(outsideRing(x, cy, SHOWDOWN_START_SEC)).toBe(false);
    expect(outsideRing(x, cy, END)).toBe(true);
  });

  it('corners of the world are outside the full ring', () => {
    expect(outsideRing(0, 0, SHOWDOWN_START_SEC + 1)).toBe(true);
  });
});

describe('showdown edge damage', () => {
  const { x: cx, y: cy } = SHOWDOWN_CENTER;

  it('no damage inside the ring or during the grace period', () => {
    expect(edgeDamage(cx, cy, END, 0.5)).toBe(0);
    expect(edgeDamage(0, 0, SHOWDOWN_START_SEC, 0.5)).toBe(0);
  });

  it('outside the ring it scales with dt', () => {
    expect(edgeDamage(0, 0, END, 1)).toBe(SHOWDOWN_EDGE_DPS);
    expect(edgeDamage(0, 0, END, 0.5)).toBeCloseTo(SHOWDOWN_EDGE_DPS / 2);
  });

  it('a zero or negative step deals nothing', () => {
    expect(edgeDamage(0, 0, END, 0)).toBe(0);
    expect(edgeDamage(0, 0, END, -1)).toBe(0);
  });
});

describe('lastSideInRing', () => {
  const T = SHOWDOWN_START_SEC + 60;
  const at = { x: SHOWDOWN_CENTER.x, y: SHOWDOWN_CENTER.y };
  const far = { x: 20, y: 20 };
  const body = (id: number, team: number | null, pos = at, down = false) => ({ id, team, down, ...pos });

  it('needs the ring to have started closing', () => {
    expect(lastSideInRing([body(1, null), body(2, null, far)], SHOWDOWN_START_SEC)).toBe(false);
  });

  it('is true when exactly one free-for-all fighter is inside', () => {
    expect(lastSideInRing([body(1, null), body(2, null), body(3, null, far)], T)).toBe(false);
    expect(lastSideInRing([body(1, null), body(2, null, far), body(3, null, far)], T)).toBe(true);
  });

  it('counts a crew as one side, however many of its fighters are inside', () => {
    expect(lastSideInRing([body(1, 0), body(2, 0), body(3, 0, far)], T)).toBe(true);
    expect(lastSideInRing([body(1, 0), body(2, 1)], T)).toBe(false);
  });

  it('ignores downed fighters and fighters outside the ring', () => {
    expect(lastSideInRing([body(1, 0), body(2, 1, at, true)], T)).toBe(true);
    expect(lastSideInRing([body(1, 0, far), body(2, 1, far)], T)).toBe(false);
  });

  it('nobody inside is not a finish (the edge damage plays it out)', () => {
    expect(lastSideInRing([body(1, 0, far), body(2, 1, far)], T)).toBe(false);
    expect(lastSideInRing([], T)).toBe(false);
  });
});
