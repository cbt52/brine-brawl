import { describe, it, expect } from 'vitest';
import { TICK_HZ } from '../../shared/constants.ts';
import { BASE_SPEED } from '../../shared/sim/world.ts';
import { BLEND_MS, Predictor, SNAP_DIST, prunePending, pruneStale, replay, speedOf } from '../../client/src/net/predict.ts';

const speed = BASE_SPEED; // 'default' kit has speedMul 1
const right = { mx: 1, my: 0 };

describe('prunePending', () => {
  it('drops every input the server acknowledged', () => {
    const p = [{ seq: 1, ...right }, { seq: 2, ...right }, { seq: 3, ...right }];
    expect(prunePending(p, 0)).toHaveLength(3);
    expect(prunePending(p, 2).map((i) => i.seq)).toEqual([3]);
    expect(prunePending(p, 3)).toHaveLength(0);
  });

  it('keeps everything when the ack is older than the list', () => {
    expect(prunePending([{ seq: 5, ...right }], 1)).toHaveLength(1);
  });
});

describe('pruneStale', () => {
  it('drops unacknowledged inputs the server forgot (they would replay forever)', () => {
    const p = [{ seq: 1, ...right, at: 1000 }, { seq: 2, ...right, at: 4900 }];
    expect(pruneStale(p, 5000).map((i) => i.seq)).toEqual([2]);
  });

  it('keeps an input that is merely in flight (150 ms lag holds ~600 ms of them)', () => {
    const p = [{ seq: 1, ...right, at: 4400 }];
    expect(pruneStale(p, 5000)).toHaveLength(1);
  });

  it('keeps untimed inputs (unit tests and an older snapshot) and fresh ones', () => {
    expect(pruneStale([{ seq: 1, ...right }], 999_999)).toHaveLength(1);
    expect(pruneStale([{ seq: 1, ...right, at: 900 }], 1000)).toHaveLength(1);
  });

  it('reconcile prunes stale pending inputs', () => {
    const p = new Predictor();
    p.reset({ x: 0, y: 0 }, 'default', 32);
    // reconcile reads the wall clock, so use timestamps far outside any real run
    p.applyInput({ seq: 1, ...right }, undefined, -1_000_000);
    p.applyInput({ seq: 2, ...right }, undefined, 1_000_000_000);
    p.reconcile({ x: 0, y: 0 }, 0, 1, 32, 'default');
    expect(p.pending.map((i) => i.seq)).toEqual([2]);
  });
});

describe('replay', () => {
  it('is the identity without pending inputs', () => {
    expect(replay({ x: 100, y: 200 }, 32, [], speed)).toEqual({ x: 100, y: 200 });
  });

  it('advances one tick of shared movement per input', () => {
    const one = replay({ x: 500, y: 500 }, 32, [{ seq: 1, ...right }], speed);
    expect(one.x - 500).toBeCloseTo(speed / TICK_HZ, 6);
    expect(one.y).toBe(500);
    // three inputs in a row = three ticks, not one
    const three = replay({ x: 500, y: 500 }, 32, [1, 2, 3].map((seq) => ({ seq, ...right })), speed);
    expect(three.x - 500).toBeCloseTo((speed * 3) / TICK_HZ, 6);
  });

  it('clamps the diagonal so a corner hold is not faster', () => {
    const d = replay({ x: 500, y: 500 }, 0, [{ seq: 1, mx: 1, my: 1 }], speed);
    expect(Math.hypot(d.x - 500, d.y - 500)).toBeCloseTo(speed / TICK_HZ, 6);
  });
});

describe('Predictor', () => {
  it('moves the drawn body the moment the input is sent', () => {
    const p = new Predictor();
    p.reset({ x: 500, y: 500 }, 'default', 32);
    p.applyInput({ seq: 1, ...right });
    expect(p.visual().x).toBeGreaterThan(500);
    expect(p.visual().y).toBe(500);
  });

  it('reconciles to the replayed server position (no drift when the server agrees)', () => {
    const p = new Predictor();
    p.reset({ x: 100, y: 100 }, 'default', 32);
    p.applyInput({ seq: 1, ...right });
    p.applyInput({ seq: 2, mx: 0, my: 1 });
    const local = p.visual();
    // server applied nothing yet and reports the start position → replay reproduces the local body
    p.reconcile({ x: 100, y: 100 }, 0, 1, 32, 'default');
    expect(p.visual().x).toBeCloseTo(local.x, 6);
    expect(p.visual().y).toBeCloseTo(local.y, 6);
  });

  it('blends a small error out over BLEND_MS and lands exactly on the server position', () => {
    const p = new Predictor();
    p.reset({ x: 400, y: 400 }, 'default', 32);
    // the server disagrees by 30 units (e.g. a dash or a buff the client cannot predict)
    p.reconcile({ x: 430, y: 400 }, 99, 1, 32, 'default');
    // nothing is acked yet and no input was pending → the drawn body must not jump
    expect(p.visual().x).toBeCloseTo(400, 6);
    p.advance(BLEND_MS / 2);
    expect(p.visual().x).toBeGreaterThan(400);
    expect(p.visual().x).toBeLessThan(430);
    p.advance(BLEND_MS);
    expect(p.visual().x).toBeCloseTo(430, 6);
    expect(p.visual().y).toBeCloseTo(400, 6);
  });

  it('snaps instead of blending when the gap exceeds SNAP_DIST', () => {
    const p = new Predictor();
    p.reset({ x: 100, y: 100 }, 'default', 32);
    p.reconcile({ x: 100 + SNAP_DIST + 20, y: 100 }, 99, 1, 32, 'default');
    expect(p.visual().x).toBeCloseTo(100 + SNAP_DIST + 20, 6);
  });

  it('snaps when the local body is down (respawn jump)', () => {
    const p = new Predictor();
    p.reset({ x: 100, y: 100 }, 'default', 32);
    p.reconcile({ x: 900, y: 900 }, 99, 1, 32, 'default', true);
    expect(p.visual()).toEqual({ x: 900, y: 900 });
  });

  it('drops acknowledged inputs so they are not replayed twice', () => {
    const p = new Predictor();
    p.reset({ x: 200, y: 200 }, 'default', 32);
    for (let seq = 1; seq <= 4; seq++) p.applyInput({ seq, ...right });
    const before = p.visual().x;
    // server applied 1 and 2 and reports the position after them
    const serverX = 200 + (speed * 2) / TICK_HZ;
    p.reconcile({ x: serverX, y: 200 }, 2, 1, 32, 'default');
    expect(p.pending.map((i) => i.seq)).toEqual([3, 4]);
    expect(p.visual().x).toBeCloseTo(before, 6);
    // and the remaining inputs keep being predicted on top of the server position
    p.applyInput({ seq: 5, ...right });
    expect(p.visual().x).toBeGreaterThan(serverX);
  });

  it('ignores a repeated snapshot tick', () => {
    const p = new Predictor();
    p.reset({ x: 300, y: 300 }, 'default', 32);
    p.reconcile({ x: 320, y: 300 }, 1, 7, 32, 'default');
    const first = p.visual();
    p.reconcile({ x: 1000, y: 1000 }, 1, 7, 32, 'default');
    expect(p.visual()).toEqual(first);
  });

  it('uses the kit speed multiplier', () => {
    expect(speedOf('default')).toBeCloseTo(BASE_SPEED, 6);
  });
});
