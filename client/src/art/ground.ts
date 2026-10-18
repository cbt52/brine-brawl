import type Phaser from 'phaser';
import { DECOR, type Rect } from '../../../shared/arena/docks.ts';
import type { Arena, ArenaId } from '../../../shared/arena/arena.ts';
import { svgForced } from './sheets.ts';

/** Arenas with a Blender-rendered ground image (`npm run art:arena -- <id>`, T42). */
export const GROUND_IDS: readonly ArenaId[] = ['docks'];

export const groundKey = (id: ArenaId): string => `ground-${id}`;
export const groundUrl = (id: ArenaId): string => `/art/arena/${id}-ground.jpg`;

/** Queue the ground images; `?art=svg` keeps the old painted ground (side-by-side comparisons). */
export function preloadGround(scene: Phaser.Scene, search?: string): void {
  if (svgForced(search)) return;
  for (const id of GROUND_IDS) scene.load.image(groundKey(id), groundUrl(id));
}

/** `?rects=1` outlines every collision / gameplay rect over the art (debug, TASKS-LOOP §2.11). */
export function rectsWanted(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('rects') === '1';
}

export interface DebugRect {
  r: Rect;
  color: number;
}

/** What `?rects=1` draws: walls red, flood pools blue, kelp green, docks barrels/crates orange. */
export function debugRects(arena: Arena): DebugRect[] {
  return [
    ...arena.obstacles.map((r) => ({ r, color: 0xff3355 })),
    ...arena.shallows.map((r) => ({ r, color: 0x33aaff })),
    ...arena.bushes.map((r) => ({ r, color: 0x33ff88 })),
    ...(arena.id === 'docks' ? DECOR : []).map((r) => ({ r, color: 0xffaa33 })),
  ];
}
