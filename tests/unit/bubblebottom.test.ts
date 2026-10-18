import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { getFighter, SELECTABLE } from '../../shared/fighters/index.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** The two Bubblebottom fighters from CP6 load and their kits do what the roster bible says. */
describe('Bubblebottom roster (CP6)', () => {
  it('Pinchpenny and Hammy are selectable with a distinct kit', () => {
    const pin = getFighter('pinchpenny');
    const ham = getFighter('hammy');
    expect(pin.name).toBe('Boss Pinchpenny');
    expect(ham.name).toBe('Hammy Divedome');
    expect(pin.faction).toBe('bubblebottom');
    expect(ham.faction).toBe('bubblebottom');
    expect(pin.element).toBe('earth');
    expect(ham.element).toBe('air');
    expect(SELECTABLE.map((f) => f.id)).toContain('pinchpenny');
    expect(SELECTABLE.map((f) => f.id)).toContain('hammy');
    expect(pin.special.kind).toBe('aoe');
    expect(ham.special.kind).toBe('dash');
  });

  it('Pinchpenny: Coin Flick pierces the first target and still hits the one behind', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pinchpenny');
    const b = w.addPlayer(2, 'B', 'default');
    const c = w.addPlayer(3, 'C', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1150; b.y = 1000; b.aim = Math.PI;
    c.x = 1350; c.y = 1000; c.aim = Math.PI;
    a.shield = 0; b.shield = 0; c.shield = 0;
    castAbility(w, a, getFighter('pinchpenny').attack, 'attack');
    run(w, 0.6);
    expect(b.hp).toBe(b.mhp - 20); // both coins of the volley hit the first body
    expect(c.hp).toBeLessThanOrEqual(c.mhp - 10); // the line carries on through it
  });

  it('Pinchpenny: Claw Clamp drags a nearby victim in and leaves it heavy', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pinchpenny');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1180; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    const before = Math.hypot(b.x - a.x, b.y - a.y);
    castAbility(w, a, getFighter('pinchpenny').special, 'special');
    run(w, 0.05);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(before - 100);
    expect(b.hp).toBe(b.mhp - 9);
    expect(b.status).toBe('heavy');
  });

  it('Pinchpenny: Register Crush slams around itself and spills three doubloons', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pinchpenny');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 880; b.y = 1000; b.aim = 0; // behind him: the register is a full circle
    a.shield = 0; b.shield = 0;
    const gold0 = a.gold;
    castAbility(w, a, getFighter('pinchpenny').ult, 'ult');
    run(w, 0.4);
    expect(b.hp).toBe(b.mhp - 18);
    expect(a.gold - gold0).toBe(3); // the coins burst out of the register and land in his claw
  });

  it('Hammy: Karate Chop is a fast short chop and misses a target off to the side', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'hammy');
    const front = w.addPlayer(2, 'F', 'default');
    const side = w.addPlayer(3, 'S', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    front.x = 1120; front.y = 1000; front.aim = Math.PI;
    side.x = 1000; side.y = 1120; side.aim = -Math.PI / 2;
    front.shield = 0; side.shield = 0;
    castAbility(w, a, getFighter('hammy').attack, 'attack');
    expect(front.hp).toBe(front.mhp - 13);
    expect(side.hp).toBe(side.mhp);
    expect(getFighter('hammy').attack.kind === 'melee' && getFighter('hammy').reload).toBeLessThan(1);
  });

  it('Hammy: Tank Rocket carries him forward and hits the fighter in the way', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'hammy');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1140; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('hammy').special, 'special');
    run(w, 0.4);
    expect(a.x).toBeGreaterThan(1200);
    expect(b.hp).toBeLessThanOrEqual(b.mhp - 17);
  });

  it('Hammy: Helmet Pop fizzes over time and slows everyone caught in the field', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'hammy');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1140; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('hammy').ult, 'ult');
    run(w, 0.05);
    expect(b.hp).toBe(b.mhp - 7);
    expect(b.status).toBe('heavy');
    run(w, 1.2);
    expect(b.hp).toBeLessThanOrEqual(b.mhp - 11); // the field keeps ticking
    expect(b.statusLeft).toBeGreaterThan(0);
  });

  it('holding special casts the claw clamp once, then the cooldown gates it', () => {
    const w = new World();
    const a = w.addPlayer(1, 'A', 'pinchpenny');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1150; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    w.setInput(1, inp({ spc: true }));
    run(w, 0.2);
    expect(a.spcCd).toBeGreaterThan(0);
    const hp1 = b.hp;
    run(w, 3);
    expect(b.hp).toBe(hp1); // no second clamp while the cooldown runs
  });
});
