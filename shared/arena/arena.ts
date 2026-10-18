import type { Cannon } from '../sim/cannon.ts';
import { OBSTACLES, SPAWNS, type Point, type Rect } from './docks.ts';
import { GALLEON_CANNONS, GALLEON_OBSTACLES, GALLEON_SPAWNS } from './galleon.ts';

/**
 * One playable layout (backlog #1 "Taffy Galleon", slice 3a): the solid scenery, the spawn points
 * and the deck cannons. `World` plays on whichever arena it was built with.
 */
export interface Arena {
  obstacles: Rect[];
  spawns: Point[];
  cannons: Cannon[];
}

export const DOCKS_ARENA: Arena = { obstacles: OBSTACLES, spawns: SPAWNS, cannons: [] };

export const GALLEON_ARENA: Arena = {
  obstacles: GALLEON_OBSTACLES,
  spawns: GALLEON_SPAWNS,
  cannons: GALLEON_CANNONS,
};
