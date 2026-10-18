import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { getFighter, SELECTABLE } from '../../shared/fighters/index.ts';
import { attackDamage } from '../../shared/fighters/stats.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** The two Saltwind fighters load and their kits do what the roster bible says. */
describe('Saltwind roster', () => {
  it('Sable and Bisque are selectable with a distinct kit', () => {
    const sable = getFighter('sable');
    const bisque = getFighter('bisque');
    expect(sable.name).toBe('Sable Tripleblade');
    expect(bisque.name).toBe('Bisque Legsworth');
    expect(sable.faction).toBe('saltwind');
    expect(bisque.faction).toBe('saltwind');
    expect(bisque.element).toBe('fire');
    expect(SELECTABLE.map((f) => f.id)).toContain('sable');
    expect(SELECTABLE.map((f) => f.id)).toContain('bisque');
    expect(sable.special.kind).toBe('dash');
    expect(bisque.special.kind).toBe('dash');
  });

  it('Sable: Twin Slash sweeps a wide arc, hitting even a target far off the aim', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'sable');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    // 60° off the aim (half arc is 75°) at 150 u
    b.x = 1000 + Math.cos((60 * Math.PI) / 180) * 150;
    b.y = 1000 + Math.sin((60 * Math.PI) / 180) * 150;
    b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('sable').attack, 'attack');
    expect(b.hp).toBe(b.mhp - attackDamage(getFighter('sable')));
  });

  it('Sable: Claw Dash Cut carries her forward and cuts the fighter in the way', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'sable');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1130; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    const hp0 = b.hp;
    castAbility(w, a, getFighter('sable').special, 'special');
    run(w, 0.4);
    expect(a.x).toBeGreaterThan(1200);
    expect(b.hp).toBeLessThan(hp0);
  });

  it('Sable: Three-Tide Tempest hits all around her, more than once', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'sable');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    // straight behind her: a spin, not a cone
    b.x = 860; b.y = 1000; b.aim = 0;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('sable').ult, 'ult');
    run(w, 0.05);
    const dmg0 = b.mhp - b.hp;
    run(w, 0.6);
    expect(dmg0).toBeGreaterThan(0);
    const dmg1 = b.mhp - b.hp;
    run(w, 0.8);
    const dmg2 = b.mhp - b.hp;
    expect(dmg2).toBeGreaterThan(dmg1);
    expect(dmg1).toBeGreaterThan(dmg0);
  });

  it('Bisque: Ladle Kick is a narrow front kick and misses a target off to the side', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'bisque');
    const front = w.addPlayer(2, 'F', 'default');
    const side = w.addPlayer(3, 'S', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    front.x = 1140; front.y = 1000; front.aim = Math.PI;
    side.x = 1000; side.y = 1140; side.aim = -Math.PI / 2;
    front.shield = 0; side.shield = 0;
    castAbility(w, a, getFighter('bisque').attack, 'attack');
    expect(front.hp).toBe(front.mhp - attackDamage(getFighter('bisque')));
    expect(side.hp).toBe(side.mhp);
  });

  it('Bisque: Skillet Rocket Kick dashes, hits and scorches the victim burning', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'bisque');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1150; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('bisque').special, 'special');
    run(w, 0.6);
    expect(a.x).toBeGreaterThan(1200);
    expect(b.hp).toBeLessThanOrEqual(b.mhp - 22);
    expect(b.status).toBe('burn');
    const afterKick = b.hp;
    run(w, 1);
    expect(b.hp).toBeLessThan(afterKick); // the pan-track keeps burning
  });

  it('Bisque: Five-Course Combo serves several kicks inside the cone only', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'bisque');
    const front = w.addPlayer(2, 'F', 'default');
    const behind = w.addPlayer(3, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    front.x = 1120; front.y = 1000; front.aim = Math.PI;
    behind.x = 880; behind.y = 1000; behind.aim = 0;
    front.shield = 0; behind.shield = 0;
    castAbility(w, a, getFighter('bisque').ult, 'ult');
    run(w, 1.2);
    expect(front.hp).toBeLessThan(front.mhp - 8); // starter + at least one follow-up kick
    expect(behind.hp).toBe(behind.mhp);
  });

  it('holding special casts the claw dash once, then the cooldown gates it', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'sable');
    a.x = 1000; a.y = 1000; a.aim = 0;
    w.setInput(1, inp({ spc: true }));
    run(w, 0.2);
    expect(a.spcCd).toBeGreaterThan(0);
    const x1 = a.x;
    // the dash is over, so a second cast would visibly move her again
    run(w, 0.6);
    const x2 = a.x;
    run(w, 1);
    expect(a.x).toBeCloseTo(x2, 3);
    expect(a.spcCd).toBeGreaterThan(0);
    expect(x1).toBeGreaterThan(1000);
  });
});
