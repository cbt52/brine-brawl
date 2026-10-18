/**
 * Ground-render layout (T42, TASKS-LOOP §2.11 "Arena"): everything `render_arena.py` needs to paint
 * the flat ground of one arena, taken straight from `shared/arena/` so the art can't drift from the
 * collision rects. Pure: `npm run art:arena` imports it via tsx and hands Blender the JSON.
 */
import { WORLD_W, WORLD_H } from '../../shared/constants.ts';
import { DECOR, type Rect } from '../../shared/arena/docks.ts';
import { DOCKS_ARENA } from '../../shared/arena/arena.ts';
import { decksFor, ISLAND, type Pier } from '../../shared/arena/shore.ts';

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
  piers: Pier[];
  /** square plank pads under the corner spawns */
  pads: Rect[];
}

export const GROUND_SCALE = 0.75;
// the decks + island shape are shared with the client's lagoon water mask (T44)
export { decksFor };

export function arenaLayout(id: string): GroundLayout {
  if (id !== 'docks') throw new Error(`no ground layout for arena "${id}" (only docks)`);
  const a = DOCKS_ARENA;
  return {
    id: 'docks',
    world: { w: WORLD_W, h: WORLD_H },
    out: { w: WORLD_W * GROUND_SCALE, h: WORLD_H * GROUND_SCALE },
    island: { ...ISLAND },
    obstacles: a.obstacles,
    bushes: a.bushes,
    shallows: a.shallows,
    decor: DECOR,
    ...decksFor(a.spawns),
  };
}
