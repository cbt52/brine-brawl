/**
 * Particle budget and automatic quality drop. No DOM, no Phaser — the game scene feeds it
 * `game.loop.actualFps`/`delta` once per frame and vitest can drive it directly.
 */

/** Live particle sprites allowed at normal quality. */
export const PARTICLE_CAP = 160;
/** Live particle sprites allowed once `lowfx` kicks in. */
export const PARTICLE_CAP_LOW = 48;
/** Below this FPS the quality watchdog starts counting. */
export const LOW_FPS = 45;
/** How long (ms) the FPS must stay low before particles drop to `PARTICLE_CAP_LOW`. */
export const LOW_FPS_MS = 3000;

export class FxBudget {
  /** low-effects mode: fewer particles (manual `?lowfx=1` or the FPS watchdog) */
  low: boolean;
  private alive = 0;
  private slowMs = 0;

  constructor(low = false) {
    this.low = low;
  }

  /** How many new particles the budget still allows right now. */
  get cap(): number {
    return this.low ? PARTICLE_CAP_LOW : PARTICLE_CAP;
  }

  get used(): number {
    return this.alive;
  }

  /** Ask for `n` particles; returns how many may actually spawn (0 = skip the effect). */
  request(n: number): number {
    return Math.max(0, Math.min(n, this.cap - this.alive));
  }

  release(n = 1): void {
    this.alive = Math.max(0, this.alive - n);
  }

  /** Reserve `n` slots for a long-lived effect; false when the budget is full right now. */
  reserve(n: number): boolean {
    if (this.request(n) < n) return false;
    this.alive += n;
    return true;
  }

  /**
   * One FPS sample. 3 s continuously below `LOW_FPS` flips `low` on. Never flips back
   * automatically — quality return is up to the caller (avoids flapping).
   */
  sample(fps: number, dtMs: number): void {
    if (this.low) return;
    if (!(fps > 0) || fps > 240) return; // throttled tab / first frames report 0
    if (fps < LOW_FPS) {
      this.slowMs += Math.min(dtMs, 250); // ignore absurd deltas after a stall
      if (this.slowMs >= LOW_FPS_MS) this.low = true;
    } else {
      this.slowMs = 0;
    }
  }
}
