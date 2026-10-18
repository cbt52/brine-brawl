/**
 * Arena props plan (T43, TASKS-LOOP §2.11 "Arena"): which 3D prop frames `render_arena_props.py`
 * renders and where each instance stands in the world, taken straight from the collision rects in
 * `shared/arena/` so the art can't drift. Pure: `npm run art:arena -- docks --props` imports it via
 * tsx, hands Blender the shapes and writes the instances into the atlas JSON (`props`).
 *
 * Projection: the props use the fighters' 35° ortho camera, but the ground is a straight top-down
 * image, so Blender stretches each model's ground depth by 1 / sin 35°: the base then covers exactly
 * its w×h collision rect on screen and only the height is foreshortened (× cos 35°). The anchor of
 * every frame is the middle of the rect's bottom (front) edge.
 */
import { WORLD_W, WORLD_H } from '../../shared/constants.ts';
import { DECOR, type Rect } from '../../shared/arena/docks.ts';
import { DOCKS_ARENA } from '../../shared/arena/arena.ts';

export type PropKind = 'wall' | 'barrel' | 'crate' | 'kelp';

/** atlas px per world unit (the ground is 0.75; fighters are ~1.75) */
export const PROP_PX = 1.5;
export const PITCH_DEG = 35;
/** model height in world units, before the camera foreshortens it by cos 35° */
export const PROP_TALL: Record<PropKind, number> = { wall: 72, barrel: 52, crate: 40, kelp: 72 };
/** transparent margin round the footprint (outline, overhanging coral, leaning fronds) */
export const PROP_PAD: Record<PropKind, number> = { wall: 8, barrel: 5, crate: 5, kelp: 16 };

export interface PropShape {
  frame: string;
  kind: PropKind;
  /** footprint = collision rect size (world units) */
  w: number;
  h: number;
  tall: number;
  pad: number;
  /** rng seed for the procedural model */
  seed: number;
  /** frame size in atlas px */
  fw: number;
  fh: number;
  /** anchor inside the frame (normalised origin) */
  ox: number;
  oy: number;
}

export interface PropInstance {
  frame: string;
  kind: PropKind;
  /** world anchor: middle of the rect's bottom edge */
  x: number;
  y: number;
  /** mirrored instances on the right half reuse the left frame flipped (the sun is centred) */
  flip: boolean;
  ox: number;
  oy: number;
}

export interface PropsLayout {
  id: 'docks';
  px: number;
  pitch: number;
  shapes: PropShape[];
  instances: PropInstance[];
}

export const propKind = (d: Rect): PropKind => (d.w > d.h ? 'crate' : 'barrel');

/** Frame size + anchor for one footprint: width w + 2 pad, height h + tall·cos35 + 2 pad. */
export function shapeFor(frame: string, kind: PropKind, w: number, h: number, seed: number, px = PROP_PX): PropShape {
  const tall = PROP_TALL[kind];
  const pad = PROP_PAD[kind];
  const up = tall * Math.cos((PITCH_DEG * Math.PI) / 180);
  const fw = Math.ceil((w + 2 * pad) * px);
  const fh = Math.ceil((h + up + 2 * pad) * px);
  return { frame, kind, w, h, tall, pad, seed, fw, fh, ox: 0.5, oy: 1 - (pad * px) / fh };
}

/** footprint tolerance of the acceptance check (world units) */
export const FOOT_TOL = 6;

/**
 * Largest distance (world units) between a measured footprint `[x0, x1, y0, y1]` (ground space,
 * anchor at 0, +y = north) and the shape's rect `[-w/2, w/2, 0, h]`; Infinity when nothing touches.
 */
export function footprintError(shape: Pick<PropShape, 'w' | 'h'>, foot: readonly number[] | null): number {
  if (!foot) return Infinity;
  const want = [-shape.w / 2, shape.w / 2, 0, shape.h];
  return Math.max(...want.map((v, i) => Math.abs(foot[i] - v)));
}

export function propsLayout(id: string, px = PROP_PX): PropsLayout {
  if (id !== 'docks') throw new Error(`no props layout for arena "${id}" (only docks)`);
  const shapes = new Map<string, PropShape>();
  const instances: PropInstance[] = [];
  const add = (kind: PropKind, r: Rect, variant: string) => {
    const frame = `${kind}_${r.w}x${r.h}${variant}`;
    let s = shapes.get(frame);
    if (!s) shapes.set(frame, (s = shapeFor(frame, kind, r.w, r.h, shapes.size + 1, px)));
    instances.push({ frame, kind, x: r.x + r.w / 2, y: r.y + r.h, flip: r.x + r.w / 2 > WORLD_W / 2, ox: s.ox, oy: s.oy });
  };
  // walls: one shape per rect size, a second variant for the bottom half so mirrored rows differ
  for (const o of DOCKS_ARENA.obstacles) add('wall', o, o.y + o.h / 2 < WORLD_H / 2 ? '_a' : '_b');
  for (const d of DECOR) add(propKind(d), d, '');
  for (const b of DOCKS_ARENA.bushes) add('kelp', b, '');
  return { id: 'docks', px, pitch: PITCH_DEG, shapes: [...shapes.values()], instances };
}
