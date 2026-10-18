import type { Cannon } from '../sim/cannon.ts';
import { BUSHES, OBSTACLES, SHALLOWS, SPAWNS, type Point, type Rect } from './docks.ts';
import { GALLEON_CANNONS, GALLEON_OBSTACLES, GALLEON_SPAWNS } from './galleon.ts';

/** Every playable layout; the id travels in MatchInfo (`ar`) so the client predicts on the same one. */
export type ArenaId = 'docks' | 'galleon';

/**
 * One playable layout (backlog #1 "Taffy Galleon", slices 3a–3c): the solid scenery, the spawn
 * points, the deck cannons, the flood pools (`shallows`) and the kelp (`bushes`). `World` plays on
 * whichever arena it was built with.
 */
export interface Arena {
  id: ArenaId;
  obstacles: Rect[];
  spawns: Point[];
  cannons: Cannon[];
  /** flood pools the tide fills (empty = a dry deck, the tide clock still runs) */
  shallows: Rect[];
  /** kelp hiding spots */
  bushes: Rect[];
}

export const DOCKS_ARENA: Arena = {
  id: 'docks', obstacles: OBSTACLES, spawns: SPAWNS, cannons: [], shallows: SHALLOWS, bushes: BUSHES,
};

// the deck has no water and no kelp: it is a dry, open fight between the masts and the guns
export const GALLEON_ARENA: Arena = {
  id: 'galleon',
  obstacles: GALLEON_OBSTACLES,
  spawns: GALLEON_SPAWNS,
  cannons: GALLEON_CANNONS,
  shallows: [],
  bushes: [],
};

/** The arena for a raw id (from MatchInfo or a join message); anything unknown plays on the docks. */
export function arenaById(raw: unknown): Arena {
  return raw === 'galleon' ? GALLEON_ARENA : DOCKS_ARENA;
}
