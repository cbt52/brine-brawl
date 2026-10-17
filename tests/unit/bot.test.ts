import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { TICK_HZ } from '../../shared/constants.ts';

function setup() {
  const w = new World();
  const a = w.addPlayer(1, 'bot', 'default', true);
  const b = w.addPlayer(2, 'target');
  a.x = 1000; a.y = 800; b.x = 1500; b.y = 800;
  a.shield = 0; b.shield = 0;
  return { w, a, b, brain: new BotBrain(1, 'normal') };
}

describe('BotBrain', () => {
  it('approaches a target and fires within 3 s', () => {
    const { w, a, b, brain } = setup();
    a.x = 700; // start out of firing range so it must close in
    const d0 = Math.hypot(a.x - b.x, a.y - b.y);
    let fired = false;
    for (let i = 0; i < 3 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      if (w.events.some((e) => e.k === 'shot' && e.id === 1)) fired = true;
      w.clearEvents();
    }
    expect(fired).toBe(true);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(d0);
  });

  it('flees at low HP', () => {
    const { w, a, b, brain } = setup();
    a.x = 1200; a.y = 800; b.x = 1400; b.y = 800;
    a.hp = 20;
    const d0 = Math.hypot(a.x - b.x, a.y - b.y);
    for (let i = 0; i < 1.5 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
    }
    expect(brain.state).toBe('flee');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(d0);
  });
});
