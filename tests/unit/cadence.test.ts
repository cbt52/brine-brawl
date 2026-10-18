import { describe, it, expect } from 'vitest';
import { TICK_HZ } from '../../shared/constants.ts';
import { MAX_BURST, TICK_MS, ticksDue } from '../../client/src/input/cadence.ts';

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
