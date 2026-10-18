/**
 * Ground-render layout (T42, TASKS-LOOP §2.11 "Arena"): everything `render_arena.py` needs to paint
 * the flat ground of one arena, taken straight from `shared/arena/` so the art can't drift from the
 * collision rects. Pure: `npm run art:arena` imports it via tsx and hands Blender the JSON.
 */
import { WORLD_W, WORLD_H } from '../../shared/constants.ts';
import { DECOR, type Point, type Rect } from '../../shared/arena/docks.ts';
import { DOCKS_ARENA } from '../../shared/arena/arena.ts';

export interface GroundLayout {
  id: 'docks';
  world: { w: number; h: number };
  /** output image size (0.75 × the world) */
  out: { w: number; h: number };
  /** sand island = world rect inset by `inset`, corner radius `radius` */
  island: { inset: number; radius: number };
  obstacles: Rect[];
  bushes: Rect[];
  shallows: Rect[];
  decor: Rect[];
  /** plank piers from the shore out to the edge-middle spawns; boards run across `dir` */
  piers: (Rect & { dir: 'x' | 'y' })[];
  /** square plank pads under the corner spawns */
  pads: Rect[];
}

export const GROUND_SCALE = 0.75;
const EDGE_NEAR = 300; // a spawn closer than this to an edge gets a pier from that edge
const PIER_W = 180;
const PIER_REACH = 100; // the pier runs this far past the spawn, inland
const PAD = 200;

/** Pier (one edge near) or pad (two edges near) for every spawn. */
export function decksFor(spawns: readonly Point[], w = WORLD_W, h = WORLD_H): Pick<GroundLayout, 'piers' | 'pads'> {
  const piers: GroundLayout['piers'] = [];
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

export function arenaLayout(id: string): GroundLayout {
  if (id !== 'docks') throw new Error(`no ground layout for arena "${id}" (only docks)`);
  const a = DOCKS_ARENA;
  return {
    id: 'docks',
    world: { w: WORLD_W, h: WORLD_H },
    out: { w: WORLD_W * GROUND_SCALE, h: WORLD_H * GROUND_SCALE },
    island: { inset: 64, radius: 190 },
    obstacles: a.obstacles,
    bushes: a.bushes,
    shallows: a.shallows,
    decor: DECOR,
    ...decksFor(a.spawns),
  };
}
