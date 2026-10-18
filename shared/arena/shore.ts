/**
 * Docks shoreline shapes (visual only, no collision): the sand island's rounded rect and the plank
 * decks under the spawns. One source for the Blender ground render (`scripts/lib/arena-layout.ts`)
 * and the client's lagoon water mask (`client/src/art/water.ts`). Pure data + pure functions.
 */
import { WORLD_W, WORLD_H } from '../constants.ts';
import type { Point, Rect } from './docks.ts';

/** sand island = world rect inset by `inset`, corner radius `radius` */
export const ISLAND = { inset: 64, radius: 190 } as const;

export type Pier = Rect & { dir: 'x' | 'y' };

const EDGE_NEAR = 300; // a spawn closer than this to an edge gets a pier from that edge
const PIER_W = 180;
const PIER_REACH = 100; // the pier runs this far past the spawn, inland
const PAD = 200;

/** Pier (one edge near; boards run across `dir`) or pad (two edges near) for every spawn. */
export function decksFor(spawns: readonly Point[], w = WORLD_W, h = WORLD_H): { piers: Pier[]; pads: Rect[] } {
  const piers: Pier[] = [];
  const pads: Rect[] = [];
  for (const s of spawns) {
    const nearX = Math.min(s.x, w - s.x) < EDGE_NEAR;
    const nearY = Math.min(s.y, h - s.y) < EDGE_NEAR;
    if (nearX && nearY) pads.push({ x: s.x - PAD / 2, y: s.y - PAD / 2, w: PAD, h: PAD });
    else if (nearY) {
      const len = (s.y < h / 2 ? s.y : h - s.y) + PIER_REACH;
      piers.push({ x: s.x - PIER_W / 2, y: s.y < h / 2 ? 0 : h - len, w: PIER_W, h: len, dir: 'y' });
    } else if (nearX) {
      const len = (s.x < w / 2 ? s.x : w - s.x) + PIER_REACH;
      piers.push({ x: s.x < w / 2 ? 0 : w - len, y: s.y - PIER_W / 2, w: len, h: PIER_W, dir: 'x' });
    }
  }
  return { piers, pads };
}
