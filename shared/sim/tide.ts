/**
 * Rising Tide (design §2.10): a 60 s cycle low → rising → high → falling that floods the arena
 * shallows. Pure data + pure functions, no DOM/Node, so the server, bots, tests and the client
 * water overlay share one source of truth.
 */
import type { TidePhase, TideInfo, PickupKind } from '../protocol.ts';
import { SHALLOWS, type Point, type Rect } from '../arena/docks.ts';

export const TIDE_LOW_SEC = 35;
export const TIDE_RISE_SEC = 5;
export const TIDE_HIGH_SEC = 15;
export const TIDE_FALL_SEC = 5;
export const TIDE_CYCLE_SEC = TIDE_LOW_SEC + TIDE_RISE_SEC + TIDE_HIGH_SEC + TIDE_FALL_SEC;

/** Movement multiplier inside flooded water. */
export const WATER_SLOW = 0.7;
/** Seconds of standing in water before it soaks you (Wet). */
export const WATER_WET_SEC = 1;
/** How much the water edge pulls in when the tide is fully out (fraction of the pool's short side). */
const INSET_FRAC = 0.35;

export const CHEST_HP = 40;
/** Reward pickups a broken chest can drop. */
export const PICKUP_HEAL = 30;
export const PICKUP_ULT_FRAC = 0.4;
/** Seconds a dropped pickup lies around before it sinks. */
export const PICKUP_SEC = 12;
/** Body radius used for chest overlap (players and chests are both round-ish). */
export const CHEST_RADIUS = 22;
/** Pickup overlap radius (a small floating drop, not a body). */
export const PICKUP_RADIUS = 18;

/** Where low-tide chests surface (inside the smallest tide pool). */
export const CHEST_SPOTS: Point[] = [
  { x: 1120, y: 780 },
  { x: 1280, y: 840 },
];

/** Physical duration of a phase. */
export function phaseSec(phase: TidePhase): number {
  switch (phase) {
    case 'low': return TIDE_LOW_SEC;
    case 'rising': return TIDE_RISE_SEC;
    case 'high': return TIDE_HIGH_SEC;
    case 'falling': return TIDE_FALL_SEC;
  }
}

/** Flood level (0 = tide out, 1 = high tide) from the phase and the seconds left in it. */
export function tideLevel(phase: TidePhase, left: number): number {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  switch (phase) {
    case 'low': return 0;
    case 'high': return 1;
    case 'rising': return clamp01(1 - left / TIDE_RISE_SEC);
    case 'falling': return clamp01(left / TIDE_FALL_SEC);
  }
}

/**
 * Water rects for a flood level: the pools shrink towards their centre as the tide goes out.
 * `pools` is the arena's flood pools (the docks shallows unless a World plays another layout).
 */
export function waterRects(level: number, pools: readonly Rect[] = SHALLOWS): Rect[] {
  const l = Math.max(0, Math.min(1, level));
  return pools.map((s) => {
    const inset = (1 - l) * INSET_FRAC * Math.min(s.w, s.h);
    return { x: s.x + inset, y: s.y + inset, w: s.w - inset * 2, h: s.h - inset * 2 };
  });
}

/** True when the point is inside flooded water at `level`. */
export function inWater(x: number, y: number, level: number, pools: readonly Rect[] = SHALLOWS): boolean {
  if (level <= 0) return false;
  for (const r of waterRects(level, pools)) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

/** Speed multiplier for a body position (1 = dry land, `WATER_SLOW` = flooded). */
export function waterSpeedMul(x: number, y: number, level: number, pools: readonly Rect[] = SHALLOWS): number {
  return inWater(x, y, level, pools) ? WATER_SLOW : 1;
}

const NEXT: Record<TidePhase, TidePhase> = {
  low: 'rising', rising: 'high', high: 'falling', falling: 'low',
};

/** The tide clock. The caller feeds fixed sim steps so it stays deterministic. */
export class Tide {
  phase: TidePhase = 'low';
  /** seconds elapsed inside the current phase */
  elapsed = 0;
  /** Showdown (backlog #6): the flood follows the ring instead of the phase clock when set */
  override: number | null = null;

  get left(): number {
    return Math.max(0, phaseSec(this.phase) - this.elapsed);
  }

  get level(): number {
    return this.override ?? tideLevel(this.phase, this.left);
  }

  /** Advance the clock; returns the phase that was just entered (or null). */
  step(dt: number): TidePhase | null {
    if (!(dt > 0)) return null;
    let rest = dt;
    let entered: TidePhase | null = null;
    let guard = 0;
    while (rest > 0 && guard++ < 8) {
      const room = phaseSec(this.phase) - this.elapsed;
      if (rest < room) { this.elapsed += rest; break; }
      rest -= room;
      this.phase = NEXT[this.phase];
      this.elapsed = 0;
      entered = this.phase;
    }
    return entered;
  }

  info(): TideInfo {
    return { phase: this.phase, t: Math.ceil(this.left), level: Math.round(this.level * 100) / 100 };
  }

  /** Debug/test hook: jump to the start of a phase. */
  force(phase: TidePhase): void {
    this.phase = phase;
    this.elapsed = 0;
  }
}

/** Which pickup a chest drops (deterministic rotation so tests and replays agree). */
export function pickupFor(index: number): PickupKind {
  const kinds: PickupKind[] = ['heal', 'ult', 'gold'];
  return kinds[((index % kinds.length) + kinds.length) % kinds.length];
}
