import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { BUSHES } from '../../shared/arena/docks.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import { BUSH_SEE_RANGE, REVEAL_SEC, canSee, inBush } from '../../shared/sim/visibility.ts';

const BUSH = BUSHES[0];
/** a spot well inside the first kelp patch */
const IN_BUSH = { x: BUSH.x + BUSH.w / 2, y: BUSH.y + BUSH.h / 2 };

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

describe('kelp visibility', () => {
  it('knows when a point is inside a bush', () => {
    expect(inBush(IN_BUSH.x, IN_BUSH.y, BUSHES)).toBe(true);
    expect(inBush(BUSH.x + 4, BUSH.y + 4, BUSHES)).toBe(true);
    expect(inBush(BUSH.x - 40, BUSH.y - 40, BUSHES)).toBe(false);
    expect(inBush(1200, 800, BUSHES)).toBe(false); // mid arena is open water
  });

  it('hides a bush-dweller from a far viewer but not from a close one', () => {
    const hid = { id: 2, x: IN_BUSH.x, y: IN_BUSH.y };
    const far = { id: 1, x: IN_BUSH.x + BUSH_SEE_RANGE + 50, y: IN_BUSH.y };
    const near = { id: 1, x: IN_BUSH.x + BUSH_SEE_RANGE - 20, y: IN_BUSH.y };
    expect(canSee(far, hid, [], BUSHES)).toBe(false);
    expect(canSee(near, hid, [], BUSHES)).toBe(true);
  });

  it('always shows open-ground fighters and yourself', () => {
    const open = { id: 2, x: 1200, y: 800 };
    const far = { id: 1, x: 100, y: 100 };
    expect(canSee(far, open, [], BUSHES)).toBe(true);
    expect(canSee({ id: 2, x: 100, y: 100 }, open, [], BUSHES)).toBe(true);
  });

  it('reveals an attacker for REVEAL_SEC and then hides them again', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'default');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = IN_BUSH.x; a.y = IN_BUSH.y; a.shield = 0;
    b.x = IN_BUSH.x + BUSH_SEE_RANGE + 200; b.y = IN_BUSH.y; b.shield = 0;
    expect(w.snapshotFor(2).players.some((p) => p.id === 1)).toBe(false);

    w.setInput(1, inp({ atk: true, seq: 1 }));
    w.step();
    expect(a.revealT).toBeGreaterThan(0); // firing reveals
    expect(w.snapshotFor(2).players.some((p) => p.id === 1)).toBe(true);

    w.setInput(1, inp({ seq: 2 }));
    run(w, REVEAL_SEC + 0.2);
    expect(a.revealT).toBe(0);
    expect(w.snapshotFor(2).players.some((p) => p.id === 1)).toBe(false);
  });

  it('hides a bush-dweller from enemy bots', () => {
    const w = new World();
    const bot = w.addPlayer(1, 'Bot', 'default', true);
    const prey = w.addPlayer(2, 'Prey', 'default');
    bot.x = IN_BUSH.x + 500; bot.y = IN_BUSH.y; bot.shield = 0;
    prey.x = IN_BUSH.x; prey.y = IN_BUSH.y; prey.shield = 0;
    const brain = new BotBrain(1, 'normal');
    for (let i = 0; i < 20; i++) brain.think(w, 1 / TICK_HZ);
    const out = brain.think(w, 1 / TICK_HZ);
    expect(out.atk).toBe(false); // no target → wander, never fires into the kelp

    prey.revealT = REVEAL_SEC; // same prey, but visible after attacking
    for (let i = 0; i < 20; i++) brain.think(w, 1 / TICK_HZ);
    expect(brain.state).not.toBe('wander');
  });
});
