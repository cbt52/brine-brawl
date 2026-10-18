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

  it('casts a self-targeted special even with the enemy out of reach', () => {
    const { w, a, brain } = setup();
    a.def = { ...a.def, special: { kind: 'buff', heal: 30, sec: 1, cd: 5 } };
    a.hp = 40;
    for (let i = 0; i < TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
    }
    expect(a.hp).toBeGreaterThan(40);
    expect(a.spcCd).toBeGreaterThan(0);
  });

  it('closes to its own melee reach instead of holding the ranged stand-off', () => {
    const w = new World();
    // Brak swings at 185 u; the old fixed 380 u stand-off meant a melee bot never connected
    const a = w.addPlayer(1, 'brak', 'brak', true);
    const b = w.addPlayer(2, 'target', 'pinchpenny');
    a.x = 700; a.y = 800; b.x = 1300; b.y = 800;
    a.shield = 0; b.shield = 0;
    const brain = new BotBrain(1, 'normal', () => 0.5);
    for (let i = 0; i < 4 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      w.clearEvents();
    }
    // it walks in (a ranged bot parks at ~380 u) and its pound actually lands
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(300);
    expect(b.hp).toBeLessThan(b.mhp);
  });
});
