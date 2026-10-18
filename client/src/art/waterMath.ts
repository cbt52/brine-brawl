/**
 * Pure helpers for the water layer (T44): lagoon mask shapes, tile scroll, flooded-pool look and
 * foam bubbles. No Phaser here so vitest can cover it; `water.ts` draws with these numbers.
 */
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import type { Arena, ArenaId } from '../../../shared/arena/arena.ts';
import type { Rect } from '../../../shared/arena/docks.ts';
import { decksFor, ISLAND } from '../../../shared/arena/shore.ts';

/** Arenas with a Blender-rendered water tile (`npm run art:arena -- <id> --water`). */
export const WATER_IDS: readonly ArenaId[] = ['docks'];
export const waterKey = (id: ArenaId): string => `water-${id}`;
export const waterUrl = (id: ArenaId): string => `/art/arena/${id}-water.png`;

/** world units per tile pixel (the 256² tile covers 384 u) */
export const WATER_TILE_SCALE = 1.5;
/** the caustics stop this far out from the island's wet rim: the foam line sits there */
const SHORE_GROW = 12;
/** pier stringers and posts poke this far past the deck rects */
const DECK_GROW = 10;

export interface RoundRect extends Rect {
  r: number;
}

/**
 * What the lagoon caustics must NOT cover (the mask is inverted): the island grown out to the
 * foam line, plus every pier and corner pad. Docks only; other layouts have no lagoon.
 */
export function lagoonHoles(arena: Arena): RoundRect[] | null {
  if (arena.id !== 'docks') return null;
  const ins = ISLAND.inset - SHORE_GROW;
  const holes: RoundRect[] = [{ x: ins, y: ins, w: WORLD_W - 2 * ins, h: WORLD_H - 2 * ins, r: ISLAND.radius + SHORE_GROW }];
  const { piers, pads } = decksFor(arena.spawns);
  for (const d of [...piers, ...pads]) {
    holes.push({ x: d.x - DECK_GROW, y: d.y - DECK_GROW, w: d.w + 2 * DECK_GROW, h: d.h + 2 * DECK_GROW, r: 6 });
  }
  return holes;
}

/**
 * Lagoon strips (top, bottom, left, right) that hold every lagoon pixel: the world edge out to
 * the end of the island's rounded corners. Keeps the masked tile sprites off the open sand.
 */
export function lagoonStrips(): Rect[] {
  const b = ISLAND.inset + ISLAND.radius;
  return [
    { x: 0, y: 0, w: WORLD_W, h: b },
    { x: 0, y: WORLD_H - b, w: WORLD_W, h: b },
    { x: 0, y: b, w: b, h: WORLD_H - 2 * b },
    { x: WORLD_W - b, y: b, w: b, h: WORLD_H - 2 * b },
  ];
}

/** Tile offset in tile pixels at `nowMs`: a slow drift with a gentle sway (static = 0, 0). */
export function waterScroll(nowMs: number, still: boolean): { x: number; y: number } {
  if (still) return { x: 0, y: 0 };
  const s = nowMs / 1000;
  return { x: s * 7 + Math.sin(s * 0.5) * 6, y: s * 3.5 + Math.cos(s * 0.37) * 5 };
}

/** tilePosition for a tile sprite whose top-left sits at (x, y), so strips line up seamlessly */
export function tileOffset(x: number, y: number, scroll: { x: number; y: number }): { x: number; y: number } {
  return { x: x / WATER_TILE_SCALE + scroll.x, y: y / WATER_TILE_SCALE + scroll.y };
}

/** Flooded-pool colours (§2.11: all ≤ 45 % saturation). */
export const POOL = {
  shallow: 0x7fb3b6,
  core: 0x5a8e9a,
  edge: 0xc8e6e4,
  foam: 0xe8f2ee,
} as const;

export interface PoolLook {
  /** corner radius of the water rect */
  radius: number;
  /** fill alpha: deeper and more opaque the higher the tide */
  alpha: number;
  /** inset of the darker core band */
  coreInset: number;
  /** foam rim stroke width */
  foam: number;
  /** caustics tile alpha */
  tile: number;
}

/** How one flooded rect looks at flood `level` (0..1); null = dry (the sim doesn't slow you). */
export function poolLook(r: Rect, level: number): PoolLook | null {
  if (!(level > 0) || r.w <= 0 || r.h <= 0) return null;
  const short = Math.min(r.w, r.h);
  return {
    radius: Math.min(24 + level * 40, short / 2),
    alpha: 0.72 + level * 0.2,
    coreInset: short * (0.14 + 0.04 * level),
    foam: 4 + level * 3,
    tile: 0.35 + level * 0.25,
  };
}

/** Points every ~`gap` u around a rounded rect (corners on the arc), for foam bubbles. */
export function rimPoints(r: Rect, radius: number, gap = 26): { x: number; y: number }[] {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const sw = r.w - 2 * rad;
  const sh = r.h - 2 * rad;
  const arc = (Math.PI / 2) * rad;
  const total = 2 * (sw + sh) + 4 * arc;
  const n = Math.max(4, Math.round(total / gap));
  const pts: { x: number; y: number }[] = [];
  // walk clockwise from the top-left end of the top edge: top, TR arc, right, BR arc, bottom, BL, left, TL
  const segs: { len: number; at: (f: number) => { x: number; y: number } }[] = [
    { len: sw, at: (f) => ({ x: r.x + rad + f * sw, y: r.y }) },
    { len: arc, at: (f) => corner(r.x + r.w - rad, r.y + rad, -Math.PI / 2 + f * (Math.PI / 2)) },
    { len: sh, at: (f) => ({ x: r.x + r.w, y: r.y + rad + f * sh }) },
    { len: arc, at: (f) => corner(r.x + r.w - rad, r.y + r.h - rad, f * (Math.PI / 2)) },
    { len: sw, at: (f) => ({ x: r.x + r.w - rad - f * sw, y: r.y + r.h }) },
    { len: arc, at: (f) => corner(r.x + rad, r.y + r.h - rad, Math.PI / 2 + f * (Math.PI / 2)) },
    { len: sh, at: (f) => ({ x: r.x, y: r.y + r.h - rad - f * sh }) },
    { len: arc, at: (f) => corner(r.x + rad, r.y + rad, Math.PI + f * (Math.PI / 2)) },
  ];
  function corner(cx: number, cy: number, a: number) {
    return { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad };
  }
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    for (const s of segs) {
      if (d <= s.len || s === segs[segs.length - 1]) {
        pts.push(s.at(s.len > 0 ? Math.min(1, d / s.len) : 0));
        break;
      }
      d -= s.len;
    }
  }
  return pts;
}

/** Bubble radius for rim point `i` (stable per index, 3.5–6.5 u). */
export function bubbleSize(i: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return 3.5 + (h - Math.floor(h)) * 3;
}
