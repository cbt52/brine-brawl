import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility, abilityReach } from '../../shared/sim/abilities.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import { getFighter, resolveFighterId, FIGHTERS } from '../../shared/fighters/index.ts';
import type { AbilityDef } from '../../shared/fighters/types.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({ seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** Two players in an open lane, A at x 1000 looking right. */
function setup(fighter = 'default', gap = 300) {
  const w = new World();
  const a = w.addPlayer(1, 'A', fighter);
  const b = w.addPlayer(2, 'B', fighter);
  a.x = 1000; a.y = 1000; a.aim = 0;
  b.x = 1000 + gap; b.y = 1000;
  a.shield = 0; b.shield = 0;
  return { w, a, b };
}

describe('registry', () => {
  it('falls back to the default fighter for unknown or hostile ids', () => {
    expect(resolveFighterId('default')).toBe('default');
    expect(resolveFighterId('mira')).toBe('default');
    expect(resolveFighterId('../../etc/passwd')).toBe('default');
    expect(resolveFighterId(undefined)).toBe('default');
    expect(resolveFighterId(42)).toBe('default');
    expect(getFighter('nope').id).toBe('default');
  });

  it('spawns a player from the fighter def, not from constants', () => {
    const w = new World();
    const p = w.addPlayer(1, 'A', 'default');
    expect(p.def).toBe(getFighter('default'));
    expect(p.r).toBe(p.def.radius);
    expect(p.mhp).toBe(p.def.maxHp);
    expect(p.ammo).toBe(p.def.ammo);
  });
});

describe('ability primitives deal damage (table-driven)', () => {
  const cases: { name: string; def: AbilityDef; gap: number; dmg: number; sec: number }[] = [
    { name: 'projectile', def: { kind: 'projectile', count: 1, spread: 0, speed: 900, range: 600, dmg: 11, radius: 8 }, gap: 300, dmg: 11, sec: 0.6 },
    { name: 'melee', def: { kind: 'melee', arcDeg: 120, range: 280, dmg: 13, knockback: 0 }, gap: 220, dmg: 13, sec: 0.1 },
    { name: 'aoe at aim', def: { kind: 'aoe', at: 'aim', range: 250, radius: 80, delay: 0.2, dmg: 15 }, gap: 250, dmg: 15, sec: 0.5 },
    { name: 'aoe at self', def: { kind: 'aoe', at: 'self', radius: 150, delay: 0, dmg: 9 }, gap: 100, dmg: 9, sec: 0.1 },
    { name: 'status', def: { kind: 'status', at: 'aim', range: 260, radius: 70, status: 'wet', sec: 2, dmg: 7 }, gap: 250, dmg: 7, sec: 0.1 },
  ];

  for (const c of cases) {
    it(`${c.name} hits a target in reach for ${c.dmg}`, () => {
      const { w, a, b } = setup('default', c.gap);
      castAbility(w, a, c.def);
      run(w, c.sec);
      expect(b.hp).toBe(b.mhp - c.dmg);
    });
  }
});

describe('projectile', () => {
  it('count + spread produce that many shots on different angles', () => {
    const { w, a } = setup();
    castAbility(w, a, { kind: 'projectile', count: 3, spread: 30, speed: 900, range: 600, dmg: 5, radius: 6 });
    expect(w.projs).toHaveLength(3);
    const angles = new Set(w.projs.map((p) => Math.round((Math.atan2(p.vy, p.vx) * 180) / Math.PI)));
    expect(angles.size).toBe(3);
  });

  it('pierce passes through and hits two enemies', () => {
    const { w, a, b } = setup();
    const c = w.addPlayer(3, 'C');
    c.x = 1250; c.y = 1000; c.shield = 0;
    b.x = 1150; b.y = 1000;
    castAbility(w, a, { kind: 'projectile', count: 1, spread: 0, speed: 900, range: 600, dmg: 6, radius: 8, pierce: true });
    run(w, 0.6);
    expect(b.hp).toBe(b.mhp - 6);
    expect(c.hp).toBe(c.mhp - 6);
  });

  it('a wall stops a normal shot but not a lobbed one', () => {
    const shot: AbilityDef = { kind: 'projectile', count: 1, spread: 0, speed: 900, range: 600, dmg: 8, radius: 8 };
    // coral wall spans x 560..680, y 560..680; target behind it at 800,620
    const straight = setup();
    straight.a.x = 480; straight.a.y = 620; straight.b.x = 800; straight.b.y = 620;
    castAbility(straight.w, straight.a, shot);
    run(straight.w, 0.6);
    expect(straight.b.hp).toBe(straight.b.mhp);

    const lobbed = setup();
    lobbed.a.x = 480; lobbed.a.y = 620; lobbed.b.x = 800; lobbed.b.y = 620;
    castAbility(lobbed.w, lobbed.a, { ...shot, lob: true });
    run(lobbed.w, 0.6);
    expect(lobbed.b.hp).toBe(lobbed.b.mhp - 8);
  });

  it('bounce reflects off a wall exactly once', () => {
    const { w, a } = setup();
    a.x = 480; a.y = 620;
    castAbility(w, a, { kind: 'projectile', count: 1, spread: 0, speed: 900, range: 600, dmg: 8, radius: 8, bounce: 1 });
    run(w, 0.12);
    expect(w.projs).toHaveLength(1);
    expect(w.projs[0].vx).toBeLessThan(0);
  });

  it('aoeOnEnd bursts where the shot expires', () => {
    const { w, a, b } = setup('default', 250);
    castAbility(w, a, {
      kind: 'projectile', count: 1, spread: 0, speed: 900, range: 100, dmg: 8, radius: 8,
      aoeOnEnd: { radius: 120, dmg: 5 },
    });
    run(w, 0.3);
    expect(b.hp).toBe(b.mhp - 5);
  });
});

describe('melee', () => {
  it('only hits inside the arc and knocks the victim back', () => {
    const { w, a, b } = setup('default', 200);
    const behind = w.addPlayer(3, 'C');
    behind.x = 800; behind.y = 1000; behind.shield = 0;
    castAbility(w, a, { kind: 'melee', arcDeg: 90, range: 280, dmg: 12, knockback: 40 });
    expect(b.hp).toBe(b.mhp - 12);
    expect(b.x).toBeGreaterThan(1200);
    expect(behind.hp).toBe(behind.mhp);
  });
});

describe('dash', () => {
  it('moves the dasher the given distance and damages a touched enemy once', () => {
    const { w, a, b } = setup('default', 160);
    const x0 = a.x;
    castAbility(w, a, { kind: 'dash', dist: 200, dur: 0.2, contactDmg: 9 });
    run(w, 0.3);
    expect(a.x - x0).toBeGreaterThan(150);
    expect(b.hp).toBe(b.mhp - 9);
    run(w, 0.3);
    expect(b.hp).toBe(b.mhp - 9);
    expect(a.dash).toBeNull();
  });
});

describe('aoe', () => {
  it('waits for the delay, then pushes', () => {
    const { w, a, b } = setup('default', 120);
    castAbility(w, a, { kind: 'aoe', at: 'self', radius: 150, delay: 0.3, dmg: 10, push: 80 });
    run(w, 0.2);
    expect(b.hp).toBe(b.mhp);
    const x0 = b.x;
    run(w, 0.2);
    expect(b.hp).toBe(b.mhp - 10);
    expect(b.x - x0).toBeGreaterThan(50);
  });

  it('tickDmg zones damage again every half second', () => {
    const { w, a, b } = setup('default', 100);
    castAbility(w, a, { kind: 'aoe', at: 'self', radius: 160, delay: 0, dmg: 4, zoneSec: 1.2, tickDmg: 3 });
    run(w, 1.2);
    // trigger 4 + two ticks (0.5 s and 1.0 s)
    expect(b.hp).toBe(b.mhp - 4 - 6);
    expect(w.zones).toHaveLength(0);
  });
});

describe('buff', () => {
  it('heals up to max HP, shields, and speeds up for its duration', () => {
    const { w, a } = setup('default', 900);
    a.hp = 50;
    castAbility(w, a, { kind: 'buff', heal: 100, shield: 2, speedMul: 1.5, sec: 1 });
    expect(a.hp).toBe(a.mhp);
    expect(a.shield).toBe(2);
    a.x = 1000; a.y = 1000;
    w.setInput(1, inp({ mx: 1 }));
    run(w, 0.5);
    expect(a.x - 1000).toBeGreaterThan(240 * 0.5 * 1.3);
    run(w, 0.6);
    expect(a.buffMul).toBe(1);
  });
});

describe('status', () => {
  it('applies the status, emits an event and expires', () => {
    const { w, a, b } = setup('default', 200);
    castAbility(w, a, { kind: 'status', at: 'aim', range: 200, radius: 60, status: 'burn', sec: 0.5 });
    expect(b.status).toBe('burn');
    expect(w.events.some((e) => e.k === 'status' && e.v === 2 && e.s === 'burn')).toBe(true);
    expect(w.snapshotFor(1).players.find((p) => p.id === 2)!.st).toBe(2);
    run(w, 0.7);
    expect(b.status).toBeNull();
  });
});

describe('ult charge & cooldowns', () => {
  it('charges from damage dealt and reports the percentage per fighter', () => {
    const { w, a, b } = setup();
    w.damage(1, b, 30, b.x, b.y);
    expect(a.uc).toBe(30);
    const snap = w.snapshotFor(1).players.find((p) => p.id === 1)!;
    expect(snap.uc).toBe(Math.round((30 / a.def.ultCharge) * 100));
    // damage you take does not charge your own ult
    w.damage(2, a, 10, a.x, a.y);
    expect(a.uc).toBe(30);
  });

  it('a hold-to-cast special fires once per cooldown and shows up in the snapshot', () => {
    const { w, a } = setup();
    w.setInput(1, inp({ spc: true }));
    w.step();
    expect(w.zones).toHaveLength(1);
    expect(a.spcCd).toBeCloseTo(a.def.special.cd ?? 0, 5);
    run(w, 0.5);
    expect(w.zones.length).toBeLessThanOrEqual(1); // no second cast while cooling down
    expect(w.snapshotFor(1).players.find((p) => p.id === 1)!.cd).toBeGreaterThan(0);
  });

  it('the ult only fires when charged and then resets the charge', () => {
    const { w, a } = setup();
    w.setInput(1, inp({ ult: true }));
    w.step();
    expect(a.uc).toBe(0);
    expect(w.projs).toHaveLength(0);

    a.uc = a.def.ultCharge;
    w.step();
    expect(a.uc).toBe(0);
    expect(w.projs.length).toBe(3); // default ult = 3-shot fan
  });
});

describe('bots press their buttons', () => {
  it('casts the special when the target is in reach, and the ult when charged', () => {
    const { w, a, b } = setup('default', 250);
    a.bot = true;
    const brain = new BotBrain(1, 'normal');
    w.setInput(1, brain.think(w, 1 / TICK_HZ));
    w.step();
    expect(w.zones.length).toBeGreaterThan(0);

    a.uc = a.def.ultCharge;
    for (let i = 0; i < 3; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
    }
    expect(a.uc).toBe(0);
    run(w, 0.4); // let the fan fly
    expect(b.hp).toBeLessThan(b.mhp);
  });

  it('abilityReach follows the primitive kind', () => {
    expect(abilityReach({ kind: 'melee', arcDeg: 90, range: 120, dmg: 1, knockback: 0 })).toBe(120);
    expect(abilityReach({ kind: 'projectile', count: 1, spread: 0, speed: 1, range: 100, dmg: 1, radius: 1 })).toBe(90);
    expect(abilityReach({ kind: 'dash', dist: 220, dur: 0.2 })).toBe(220);
    expect(abilityReach({ kind: 'aoe', at: 'aim', range: 100, radius: 40, delay: 0, dmg: 1 })).toBe(140);
    expect(abilityReach({ kind: 'aoe', at: 'self', radius: 40, delay: 0, dmg: 1 })).toBe(40);
    expect(abilityReach({ kind: 'buff', sec: 1 })).toBe(Infinity);
  });

  it('every registered special has a positive cooldown', () => {
    for (const f of FIGHTERS) expect(f.special.cd, `${f.id} special cd`).toBeGreaterThan(0);
  });

  it('a special with cd 0 cannot re-cast every tick', () => {
    const { w, a } = setup();
    a.def = { ...a.def, special: { kind: 'buff', sec: 1, cd: 0 } };
    let casts = 0;
    for (let i = 0; i < TICK_HZ; i++) {
      w.setInput(1, inp({ spc: true }));
      w.step();
      casts += w.events.filter((e) => e.k === 'cast' && e.id === 1 && e.ab === 'buff').length;
      w.clearEvents();
    }
    expect(casts).toBeGreaterThan(0);
    expect(casts).toBeLessThanOrEqual(2);
  });
});
