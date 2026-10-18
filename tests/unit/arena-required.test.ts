import { describe, it, expect } from 'vitest';
import { inWater, waterRects, waterSpeedMul } from '../../shared/sim/tide.ts';
import { canSee, inBush } from '../../shared/sim/visibility.ts';
import { makePurrl, stepPurrl } from '../../shared/sim/purrl.ts';
import { stepMove } from '../../shared/sim/world.ts';
import { GALLEON_ARENA } from '../../shared/arena/arena.ts';

describe('arena lists are required, no docks fallback (backlog #41)', () => {
  it('a call that forgets the arena list does not compile', () => {
    // compile-time guard: `npm run typecheck` fails if one of these stops needing its list.
    // The closures are never called; they only exist for the type checker.
    const forgotten = [
      // @ts-expect-error waterRects needs the flood pools
      () => waterRects(1),
      // @ts-expect-error inWater needs the flood pools
      () => inWater(1, 1, 1),
      // @ts-expect-error waterSpeedMul needs the flood pools
      () => waterSpeedMul(1, 1, 1),
      // @ts-expect-error inBush needs the kelp rects
      () => inBush(1, 1),
      // @ts-expect-error canSee needs the steam circles and the kelp rects
      () => canSee({ id: 1, x: 1, y: 1 }, { id: 2, x: 1, y: 1 }),
      // @ts-expect-error stepPurrl needs the arena it swims in
      () => stepPurrl(makePurrl(), 1 / 30),
      // @ts-expect-error stepMove needs the arena's static scenery
      () => stepMove({ x: 1, y: 1, r: 1 }, 1, 0, 100, 1 / 30),
    ];
    expect(forgotten).toHaveLength(7);
  });

  it('the galleon deck is passed its own lists, so nothing is wet or kelp-hidden there', () => {
    expect(inWater(1200, 800, 1, GALLEON_ARENA.shallows)).toBe(false);
    expect(waterSpeedMul(1200, 800, 1, GALLEON_ARENA.shallows)).toBe(1);
    expect(inBush(310, 890, GALLEON_ARENA.bushes)).toBe(false);
  });
});
