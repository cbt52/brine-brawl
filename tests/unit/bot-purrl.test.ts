import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { TICK_HZ } from '../../shared/constants.ts';

/** A lone hurt bot on open sand, with the snail parked 250 u to its right (it rests, so it stays put). */
function setup(hpFrac: number) {
  const w = new World();
  const a = w.addPlayer(1, 'bot', 'default', true);
  a.x = 1000; a.y = 800; a.shield = 0;
  a.hp = a.mhp * hpFrac;
  w.purrl.x = 1250; w.purrl.y = 800;
  w.purrl.tx = 1250; w.purrl.ty = 800; w.purrl.pause = 99;
  return { w, a, brain: new BotBrain(1, 'normal') };
}

describe('bots seek Purrl (backlog #12)', () => {
  it('a hurt bot with nothing to fight walks over and takes the snail heal', () => {
    const { w, a, brain } = setup(0.5);
    let sawSnail = false;
    for (let i = 0; i < 6 * TICK_HZ && !a.purrlFed; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      if (brain.state === 'snail') sawSnail = true;
    }
    expect(sawSnail).toBe(true);
    expect(a.purrlFed).toBe(true);
  });

  it('a healthy bot ignores the snail', () => {
    const { w, a, brain } = setup(1);
    for (let i = 0; i < 2 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      expect(brain.state).not.toBe('snail');
    }
    expect(a.purrlFed).toBe(false);
  });

  it('a bot whose life already had its heal does not walk back for it', () => {
    const { w, a, brain } = setup(0.5);
    a.purrlFed = true;
    for (let i = 0; i < 2 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      expect(brain.state).not.toBe('snail');
    }
  });

  it('a hurt bot far from the snail keeps wandering', () => {
    const { w, a, brain } = setup(0.5);
    w.purrl.x = 1900; w.purrl.y = 1400; w.purrl.tx = 1900; w.purrl.ty = 1400;
    for (let i = 0; i < 2 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      expect(brain.state).not.toBe('snail');
    }
    expect(a.purrlFed).toBe(false);
  });
});
