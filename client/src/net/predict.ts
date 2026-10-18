import { TICK_HZ } from '../../../shared/constants.ts';
import type { Rect } from '../../../shared/arena/docks.ts';
import { DOCKS_ARENA, type Arena } from '../../../shared/arena/arena.ts';
import { BASE_SPEED, stepMove } from '../../../shared/sim/world.ts';
import { waterSpeedMul } from '../../../shared/sim/tide.ts';
import { getFighter } from '../../../shared/fighters/index.ts';
import type { Bubble } from '../../../shared/sim/bubbles.ts';

/** Divergence (world units) above which the predicted body snaps instead of blending. */
export const SNAP_DIST = 120;
/** Milliseconds over which a small prediction error is blended out. */
export const BLEND_MS = 100;

export interface PredInput {
  seq: number;
  mx: number;
  my: number;
  /** client clock when it was sent (ms); stale entries are dropped on reconcile */
  at?: number;
}

export interface Pos {
  x: number;
  y: number;
}

/** One prediction step lasts exactly one sim tick, so local and replayed input agree.
 * Valid because `Controls` emits one input per tick (see input/controls.ts). */
const DT = 1 / TICK_HZ;
/** An input the server never acknowledged is dropped after this age instead of being replayed forever
 * (a dropped message is never re-acked, and re-acking it would leave a permanent position offset).
 * One second is far above any live round-trip (the ?lag=150 e2e run holds ~600 ms of inputs) but
 * still bounds a stuck replay. */
export const MAX_PENDING_MS = 1000;

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Movement speed of a kit, including its own speed multiplier. */
export function speedOf(fighter: string): number {
  return BASE_SPEED * getFighter(fighter).speedMul;
}

/** Inputs the server has not applied yet (`seq > ack`). */
export function prunePending(pending: readonly PredInput[], ack: number): PredInput[] {
  let n = 0;
  while (n < pending.length && pending[n].seq <= ack) n++;
  return n === 0 ? (pending as PredInput[]) : pending.slice(n);
}

/** Drop unacknowledged inputs older than `maxAge` ms so a lost message cannot replay forever. */
export function pruneStale(pending: readonly PredInput[], now: number, maxAge = MAX_PENDING_MS): PredInput[] {
  const keep = pending.filter((i) => i.at === undefined || now - i.at <= maxAge);
  return keep.length === pending.length ? (pending as PredInput[]) : keep;
}

/** Run pending inputs from an authoritative position (one shared movement step each).
 * `extra` holds dynamic obstacles (stone walls), so a wall prediction agrees with the server;
 * `bubbles` does the same for the bubble storm (backlog #17); `area` is the match's arena (its
 * scenery and flood pools; the docks unless the match plays another layout). */
export function replay(
  from: Pos,
  r: number,
  pending: readonly PredInput[],
  speed: number,
  waterLevel = 0,
  extra?: readonly Rect[],
  bubbles?: readonly Bubble[],
  area: Arena = DOCKS_ARENA,
): Pos {
  const p = { x: from.x, y: from.y, r };
  for (const i of pending) {
    stepMove(p, i.mx, i.my, speed * waterSpeedMul(p.x, p.y, waterLevel, area.shallows), DT, area.obstacles, extra, bubbles);
  }
  return { x: p.x, y: p.y };
}

/**
 * Client-side prediction of the local body.
 *
 * Local inputs move `pos` immediately; every snapshot re-bases `pos` on the server
 * position and replays the still-unacknowledged inputs. The difference the correction
 * introduces is kept as an offset and blended towards zero over `BLEND_MS` (or dropped
 * instantly when it exceeds `SNAP_DIST`), so corrections never look like a teleport.
 */
export class Predictor {
  /** predicted (authoritative-ish) position */
  pos: Pos = { x: 0, y: 0 };
  /** visual offset still fading out */
  private off: Pos = { x: 0, y: 0 };
  private blendLeft = 0;
  private lastTick = -1;
  private r = 32;
  private speed = BASE_SPEED;
  /** rising-tide flood level, so water slow-down is predicted too (see shared/sim/tide.ts) */
  private waterLevel = 0;
  /** stone walls from the last snapshot (dynamic obstacles the server collides with) */
  private walls: readonly Rect[] = [];
  /** bubbles from the last snapshot (bubble storm, backlog #17), so the carry and slow are predicted */
  private bubbles: readonly Bubble[] = [];
  /** the match's arena: scenery and flood pools the replay collides with (backlog #26) */
  private area: Arena = DOCKS_ARENA;
  pending: PredInput[] = [];

  /** Start predicting a body (on welcome / first snapshot). */
  reset(at: Pos, fighter: string, radius: number): void {
    this.pos = { x: at.x, y: at.y };
    this.off = { x: 0, y: 0 };
    this.blendLeft = 0;
    this.pending = [];
    this.lastTick = -1;
    this.speed = speedOf(fighter);
    this.r = radius;
  }

  /** Feed the current tide flood level (0 = dry, 1 = high tide). */
  setWater(level: number): void {
    this.waterLevel = level;
  }

  /** Feed the stone walls of the last snapshot, so the replay blocks on them like the server does. */
  setWalls(rects: readonly Rect[]): void {
    this.walls = rects;
  }

  /** Feed the match's arena (from MatchInfo `ar`), so the replay blocks on its scenery and pools. */
  setArena(area: Arena): void {
    this.area = area;
  }

  /** Feed the bubbles of the last snapshot (empty outside a bubble storm). */
  setBubbles(list: readonly Bubble[]): void {
    this.bubbles = list;
  }

  /** A local input left the client: move at once and remember it until it is acked. */
  applyInput(i: PredInput, dt = DT, now = nowMs()): void {
    this.pending.push(i.at === undefined ? { ...i, at: now } : i);
    if (this.pending.length > 240) this.pending.shift();
    const body = { x: this.pos.x, y: this.pos.y, r: this.r };
    stepMove(
      body, i.mx, i.my, this.speed * waterSpeedMul(body.x, body.y, this.waterLevel, this.area.shallows), dt,
      this.area.obstacles, this.walls, this.bubbles,
    );
    this.pos = { x: body.x, y: body.y };
  }

  /**
   * Snapshot arrived. `tick` guards against reconciling twice on the same snapshot.
   * `down` snaps instead of blending (a KO/respawn jump is not an error).
   */
  reconcile(server: Pos, ack: number, tick: number, r: number, fighter: string, down = false): void {
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    this.speed = speedOf(fighter);
    this.r = r;
    this.pending = pruneStale(prunePending(this.pending, ack), nowMs());
    const target = replay(server, r, this.pending, this.speed, this.waterLevel, this.walls, this.bubbles, this.area);
    const seen = this.visual();
    this.pos = target;
    if (down || Math.hypot(seen.x - target.x, seen.y - target.y) > SNAP_DIST) {
      this.off = { x: 0, y: 0 };
      this.blendLeft = 0;
      return;
    }
    // re-base the drawn body on the new target: the offset IS the error, so assign it — adding to the
    // old offset feeds `off` back into `visual()` and makes it grow on every snapshot
    this.off = { x: seen.x - target.x, y: seen.y - target.y };
    this.blendLeft = BLEND_MS;
  }

  /** Fade the correction offset; call once per rendered frame with the frame delta in ms. */
  advance(dtMs: number): void {
    if (this.blendLeft <= 0) return;
    this.blendLeft = Math.max(0, this.blendLeft - Math.max(0, dtMs));
    if (this.blendLeft === 0) this.off = { x: 0, y: 0 };
  }

  /** What to draw: predicted position plus the shrinking correction offset. */
  visual(): Pos {
    if (this.blendLeft <= 0) return { x: this.pos.x, y: this.pos.y };
    const k = this.blendLeft / BLEND_MS;
    return { x: this.pos.x + this.off.x * k, y: this.pos.y + this.off.y * k };
  }
}
