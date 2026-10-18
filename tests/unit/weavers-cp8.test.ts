import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { getFighter, SELECTABLE } from '../../shared/fighters/index.ts';
import { hasStatus, statusMask } from '../../shared/fighters/types.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** The Weavers trio of CP8: Ashka, Kip and Uncle Tobo. */
describe('Weavers roster (CP8)', () => {
  it('all three are selectable with a cooldown on their special', () => {
    const ids = SELECTABLE.map((f) => f.id);
    for (const id of ['ashka', 'kip', 'tobo']) expect(ids).toContain(id);
    const a = getFighter('ashka');
    const k = getFighter('kip');
    const t = getFighter('tobo');
    expect([a.name, k.name, t.name]).toEqual(['Ashka Flameheart', 'Kip Boomer', 'Uncle Tobo']);
    expect([a.element, k.element, t.element]).toEqual(['fire', 'neutral', 'volt']);
    for (const f of [a, k, t]) {
      expect(f.faction).toBe('weavers');
      expect(f.special.cd).toBeGreaterThan(0);
    }
  });

  it('Ashka: Fire Darts fire as a volley of three and land fire damage', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'ashka');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1240; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('ashka').attack, 'attack');
    expect(w.projs.length).toBe(3);
    const hp0 = b.hp;
    run(w, 0.5);
    expect(b.hp).toBeLessThan(hp0);
  });

  it('Ashka: Flame Step dashes forward and leaves burning ground behind her', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'ashka');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1100; b.y = 1040; // inside the 46 u trail radius of the dash lane
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('ashka').special, 'special');
    run(w, 0.3);
    expect(a.x).toBeGreaterThan(1180);
    expect(b.status).toBe('burn');
  });

  it('Ashka: Phoenix Ribbon sweeps a wide arc but not straight behind her', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'ashka');
    const side = w.addPlayer(2, 'side', 'default');
    const rear = w.addPlayer(3, 'rear', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    // 100° off the aim is still inside the 210° arc, 160° is outside it
    side.x = 1000 + Math.cos((100 * Math.PI) / 180) * 120;
    side.y = 1000 + Math.sin((100 * Math.PI) / 180) * 120;
    rear.x = 1000 + Math.cos((160 * Math.PI) / 180) * 120;
    rear.y = 1000 + Math.sin((160 * Math.PI) / 180) * 120;
    for (const p of [a, side, rear]) p.shield = 0;
    castAbility(w, a, getFighter('ashka').ult, 'ult');
    expect(side.hp).toBeLessThan(side.mhp);
    expect(hasStatus(statusMask(side.status), 'burn')).toBe(true);
    expect(rear.hp).toBe(rear.mhp);
  });

  it('Kip: the boomerang hits the same enemy on the way out and on the way back', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'kip');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1200; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('kip').attack, 'attack');
    expect(w.projs[0].returns).toBe(true);
    const hp0 = b.hp;
    run(w, 0.8); // outbound leg: one hit
    expect(b.hp).toBe(hp0 - 15); // T33: boomerang 13 → 15
    run(w, 1.2); // back through the same target
    expect(b.hp).toBe(hp0 - 30); // T33: two hits of 15
    expect(w.projs.length).toBe(0); // caught by its owner
  });

  it('Kip: Smoke Pop drops a cloud and speeds the caster up', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'kip');
    const slow = new World();
    const s = slow.addPlayer(1, 'A', 'kip');
    a.x = 1000; a.y = 1000; a.aim = 0;
    s.x = 1000; s.y = 1000; s.aim = 0;
    a.shield = 0; s.shield = 0;
    castAbility(w, a, getFighter('kip').special, 'special');
    expect(w.zones.length).toBe(1);
    expect(a.buffMul).toBeGreaterThan(1);
    expect(a.buffLeft).toBeGreaterThan(2);
    w.setInput(1, inp({ mx: 1 }));
    slow.setInput(1, inp({ mx: 1 }));
    run(w, 0.5);
    run(slow, 0.5);
    expect(a.x - 1000).toBeGreaterThan(s.x - 1000 + 20);
  });

  it('Kip: Triple Rang throws three returning boomerangs', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'kip');
    a.x = 1000; a.y = 1000; a.aim = 0;
    a.shield = 0;
    castAbility(w, a, getFighter('kip').ult, 'ult');
    expect(w.projs.length).toBe(3);
    expect(w.projs.every((p) => p.returns)).toBe(true);
    run(w, 2.5);
    expect(w.projs.length).toBe(0);
  });

  it('Tobo: Hot Tea Splash burns a target in the cone', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'tobo');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1090; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('tobo').attack, 'attack');
    expect(b.hp).toBe(b.mhp - 24); // T33: hot tea splash 15 → 24
    expect(hasStatus(statusMask(b.status), 'burn')).toBe(true);
  });

  it('Tobo: Tea Break heals over time, not all at once', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'tobo');
    a.x = 1000; a.y = 1000; a.aim = 0;
    a.shield = 0;
    a.hp = 50;
    castAbility(w, a, getFighter('tobo').special, 'special');
    run(w, 0.6);
    const early = a.hp;
    expect(early).toBeGreaterThan(50);
    expect(early).toBeLessThan(80);
    run(w, 2.6);
    expect(a.hp).toBeGreaterThan(early);
  });

  it('Tobo: Redirect Bolt burns through every enemy in its line', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'tobo');
    const b = w.addPlayer(2, 'B', 'default');
    const c = w.addPlayer(3, 'C', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1300; b.y = 1000; c.x = 1500; b.y = 1000; c.y = 1000;
    for (const p of [a, b, c]) p.shield = 0;
    castAbility(w, a, getFighter('tobo').ult, 'ult');
    run(w, 0.5);
    expect(b.hp).toBe(b.mhp - 30);
    expect(c.hp).toBe(c.mhp - 30);
    expect(hasStatus(statusMask(b.status), 'static')).toBe(true);
  });

  it('bots press the heal special instead of hoarding it', () => {
    const w = new World();
    const a = w.addPlayer(1, 'bot', 'tobo', true);
    const b = w.addPlayer(2, 'target');
    a.x = 1000; a.y = 800; b.x = 1600; b.y = 800;
    a.shield = 0; b.shield = 0;
    a.hp = 40;
    const brain = new BotBrain(1, 'normal');
    for (let i = 0; i < TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      w.clearEvents();
    }
    expect(a.hp).toBeGreaterThan(40);
    expect(a.spcCd).toBeGreaterThan(0);
  });
});
