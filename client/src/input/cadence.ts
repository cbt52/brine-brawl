/**
 * Input send cadence (pure, no Phaser — unit-tested in tests/unit/cadence.test.ts).
 *
 * The server applies exactly one queued input per sim tick (`world.step`), while a browser renders
 * at 60/120/144 Hz. Sending one input per rendered frame therefore sends more inputs than ticks,
 * which both hits the server's 60 msg/s cap (silently dropped messages are never re-acked, so the
 * client replays them forever) and makes a one-step-per-input prediction run ahead of the server.
 * Emitting exactly TICK_HZ inputs per second fixes both at once.
 */
import { TICK_HZ } from '../../../shared/constants.ts';

export const TICK_MS = 1000 / TICK_HZ;
/** A stalled frame (tab switch, GC pause) must not fire a burst of inputs on resume. */
export const MAX_BURST = 3;

/**
 * Input sends owed for one rendered frame.
 * `acc` is the leftover fraction (< 1 tick) carried between frames, so every render rate averages
 * exactly `TICK_HZ` sends per second.
 */
export function ticksDue(acc: number, frameMs: number, tickMs = TICK_MS, max = MAX_BURST): { n: number; acc: number } {
  const base = Number.isFinite(acc) ? Math.min(max, Math.max(0, acc)) : 0;
  const frame = Number.isFinite(frameMs) ? Math.max(0, frameMs) : 0;
  const grown = Math.min(max, base + frame / tickMs);
  // +1e-6 absorbs the float error of `2 * (1000 / 60) < 1000 / 30`
  const n = Math.min(max, Math.floor(grown + 1e-6));
  return { n, acc: grown - n };
}
