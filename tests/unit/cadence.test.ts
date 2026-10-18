import { describe, it, expect } from 'vitest';
import { TICK_HZ } from '../../shared/constants.ts';
import { EDGE_MS, MAX_BURST, TICK_MS, edgeDue, ticksDue } from '../../client/src/input/cadence.ts';

/** Feed a fixed frame interval for `ms` and count the emitted inputs. */
function run(frameMs: number, ms: number): { sent: number; frames: number } {
  let acc = 0;
  let sent = 0;
  const frames = Math.round(ms / frameMs);
  for (let i = 0; i < frames; i++) {
    const d = ticksDue(acc, frameMs);
    acc = d.acc;
    sent += d.n;
  }
  return { sent, frames };
}

describe('ticksDue', () => {
  it('sends exactly TICK_HZ inputs per second at any render rate', () => {
    for (const hz of [30, 60, 120, 144]) {
      const { sent } = run(1000 / hz, 4000);
      // 4 s at 30 inputs/s, allow the one-tick phase
      expect(Math.abs(sent - TICK_HZ * 4)).toBeLessThanOrEqual(1);
    }
  });

  it('never needs more than one send per tick-period of accumulated time', () => {
    const { n, acc } = ticksDue(0, TICK_MS / 2);
    expect(n).toBe(0);
    expect(acc).toBeCloseTo(0.5, 6);
    // the leftover is spent on the next frame instead of being lost
    const next = ticksDue(acc, TICK_MS / 2);
    expect(next.n).toBe(1);
    expect(next.acc).toBeCloseTo(0, 6);
  });

  it('caps a stalled frame so a tab switch does not fire a burst', () => {
    const d = ticksDue(0, 5000);
    expect(d.n).toBe(MAX_BURST);
    expect(d.acc).toBeLessThanOrEqual(MAX_BURST);
  });

  it('ignores a non-finite or backwards clock', () => {
    expect(ticksDue(0, Number.NaN).n).toBe(0);
    expect(ticksDue(0, -50).n).toBe(0);
  });
});

describe('edge sends', () => {
  /**
   * Mirrors `Controls.update`: ticks first, else at most one edge send, which then consumes the
   * pending tick fraction. `dir` changes every frame (true of the raw touch joystick).
   */
  function sim(hz: number, ms: number): number {
    const frameMs = 1000 / hz;
    const frames = Math.round(ms / frameMs);
    let acc = 0;
    let sent = 0;
    let lastSent = 0;
    let lastDir = '';
    let now = 0;
    for (let i = 0; i < frames; i++) {
      now += frameMs;
      const dir = i % 2 ? '1.0,0.2' : '1.0,0.1';
      const moved = dir !== lastDir;
      lastDir = dir;
      const due = ticksDue(acc, frameMs);
      acc = due.acc;
      if (due.n > 0) {
        sent += due.n;
        lastSent = now;
      } else if (edgeDue(due.n, moved, now, lastSent)) {
        sent++;
        lastSent = now;
        acc = 0;
      }
    }
    return sent;
  }

  it('stays near TICK_HZ per second at any render rate even when the direction moves every frame', () => {
    for (const hz of [30, 60, 120, 144]) {
      const sec = 10;
      const sent = sim(hz, sec * 1000);
      // hard ceiling: 60/s would be the server cap, 2 x TICK_HZ the two-branch failure mode
      expect(sent).toBeLessThanOrEqual((TICK_HZ + 2) * sec);
      expect(sent).toBeGreaterThanOrEqual(TICK_HZ * sec - MAX_BURST);
    }
  });

  it('ignores a direction change in a frame that already sends a tick', () => {
    expect(edgeDue(1, true, 1000, 900)).toBe(false);
  });

  it('sends at most one edge per tick gap', () => {
    expect(edgeDue(0, true, 1000, 1000 - EDGE_MS)).toBe(true);
    expect(edgeDue(0, true, 1000, 1000 - EDGE_MS + 1)).toBe(false);
    expect(edgeDue(0, false, 10_000, 0)).toBe(false);
  });
});
