import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { castAbility, abilityReach } from '../../shared/sim/abilities.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import { getFighter, randomFighterId, resolveFighterId, FIGHTERS } from '../../shared/fighters/index.ts';
import { STATUS_BIT } from '../../shared/fighters/types.ts';
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
    expect(resolveFighterId('unknown-kit')).toBe('default');
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
    expect(w.snapshotFor(1).players.find((p) => p.id === 2)!.st).toBe(STATUS_BIT.burn);
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

describe('T10 kits: Voltbun + Mira Tidecaller', () => {
  it('registers both kits and bots pick registered ids at random', () => {
    expect(getFighter('voltbun').id).toBe('voltbun');
    expect(getFighter('mira').id).toBe('mira');
    for (let i = 0; i < 20; i++) {
      const id = randomFighterId();
      expect(FIGHTERS.some((f) => f.id === id)).toBe(true);
    }
  });

  it('Spark Hop fires two short bolts', () => {
    const { w, a } = setup('voltbun');
    castAbility(w, a, getFighter('voltbun').attack);
    expect(w.projs).toHaveLength(2);
  });

  it('Static Dash leaves a static trail behind the dasher', () => {
    const { w, a, b } = setup('voltbun', 150);
    b.y = 1070; // beside the dash lane, inside the trail radius
    const x0 = a.x;
    castAbility(w, a, getFighter('voltbun').special);
    run(w, 0.3);
    expect(a.x - x0).toBeGreaterThan(200);
    expect(b.status).toBe('static');
  });

  it('Thunder Burrow: untargetable underground, then lands at the aim point with a stun blast', () => {
    const { w, a, b } = setup('voltbun', 400);
    b.x = 1400;
    const hp0 = a.hp;
    castAbility(w, a, getFighter('voltbun').ult);
    expect(a.burrow).not.toBeNull();
    w.damage(2, a, 10, a.x, a.y); // enemy fire cannot touch the burrower
    expect(a.hp).toBe(hp0);
    expect(w.snapshotFor(2).players.some((p) => p.id === 1)).toBe(false);
    expect(w.snapshotFor(1).players.some((p) => p.id === 1)).toBe(true);
    run(w, 0.8);
    expect(a.burrow).toBeNull();
    expect(a.x).toBeGreaterThan(1350);
    expect(b.hp).toBe(b.mhp - 28);
    expect(b.status).toBe('stun');
  });

  it('a stunned victim cannot move, aim or attack for the stun duration', () => {
    const { w, a, b } = setup('default', 300);
    b.status = 'stun';
    b.statusLeft = 1;
    const x0 = b.x;
    const ammo0 = b.ammo;
    const aim0 = b.aim;
    for (let i = 0; i < TICK_HZ / 3; i++) {
      w.setInput(2, inp({ seq: 10 + i, mx: -1, ax: 0, ay: 1, atk: true, spc: true, ult: true }));
      w.step();
    }
    expect(b.x).toBe(x0);
    expect(b.ammo).toBe(ammo0);
    expect(b.aim).toBe(aim0);
    expect(b.status).toBe('stun');
    run(w, 1);
    expect(b.status).toBeNull();
    expect(a.hp).toBe(a.mhp); // no shots landed on A either
  });

  it('Water Whip is a long thin lash that soaks the target', () => {
    const { w, a, b } = setup('mira', 240);
    const behind = w.addPlayer(3, 'C');
    behind.x = 900; behind.y = 1000; behind.shield = 0;
    castAbility(w, a, getFighter('mira').attack);
    expect(b.hp).toBe(b.mhp - 18);
    expect(b.status).toBe('wet');
    expect(behind.hp).toBe(behind.mhp);
  });

  it('Tide Push shoves only the cone in front of Mira', () => {
    const { w, a, b } = setup('mira', 180);
    const behind = w.addPlayer(3, 'C');
    behind.x = 820; behind.y = 1000; behind.shield = 0;
    const front0 = b.x;
    const back0 = behind.x;
    castAbility(w, a, getFighter('mira').special);
    run(w, 0.1);
    expect(b.x - front0).toBeGreaterThan(80);
    expect(behind.x).toBe(back0);
    expect(behind.hp).toBe(behind.mhp);
  });

  it('Maelstrom drags the target toward the vortex and ticks damage', () => {
    const { w, a, b } = setup('mira', 400);
    b.x = 1400;
    const hp0 = b.hp;
    castAbility(w, a, getFighter('mira').ult);
    run(w, 0.4);
    const d0 = Math.abs(b.x - 1320);
    run(w, 1.0);
    expect(b.hp).toBeLessThan(hp0);
    expect(Math.abs(b.x - 1320)).toBeLessThan(d0);
  });
});

describe('T11 kits: Cap\'n Noodle + Sudsy Loofah', () => {
  it('registers both kits', () => {
    expect(getFighter('noodle').id).toBe('noodle');
    expect(getFighter('sudsy').id).toBe('sudsy');
    expect(FIGHTERS.map((f) => f.id)).toEqual(expect.arrayContaining(['noodle', 'sudsy']));
  });

  it('Taffy Jab reaches far past a normal punch', () => {
    const { w, a, b } = setup('noodle', 230);
    castAbility(w, a, getFighter('noodle').attack);
    expect(b.hp).toBe(b.mhp - 22);
    expect(b.x).toBeGreaterThan(1200); // knockback lands
    const far = setup('noodle', 340);
    castAbility(far.w, far.a, getFighter('noodle').attack);
    expect(far.b.hp).toBe(far.b.mhp);
  });

  it('Sling Grab yanks Noodle forward and stops on the first enemy with bonus damage', () => {
    const { w, a, b } = setup('noodle', 260);
    const x0 = a.x;
    castAbility(w, a, getFighter('noodle').special);
    run(w, 0.4);
    expect(a.x - x0).toBeGreaterThan(120);
    expect(a.x).toBeLessThan(b.x); // stopped on contact instead of flying past
    expect(a.dash).toBeNull();
    expect(b.hp).toBe(b.mhp - 26); // more than the jab's 22
  });

  it('Sling Grab stops at a wall', () => {
    const { w, a } = setup('noodle', 700);
    a.x = 460; a.y = 620; a.aim = 0; // coral wall spans x 560..680
    castAbility(w, a, getFighter('noodle').special);
    run(w, 0.4);
    expect(a.x).toBeLessThan(560);
  });

  it('Taffy Typhoon is a cone barrage that ticks, and leaves the back clear', () => {
    const { w, a, b } = setup('noodle', 180);
    const behind = w.addPlayer(3, 'C');
    behind.x = 840; behind.y = 1000; behind.shield = 0;
    const hp0 = b.hp;
    castAbility(w, a, getFighter('noodle').ult);
    run(w, 1.1);
    expect(hp0 - b.hp).toBeGreaterThan(12); // trigger hit plus at least one tick
    expect(behind.hp).toBe(behind.mhp); // outside the 95° cone
  });

  it('Bubble Volley fires three slow bouncing bubbles', () => {
    const { w, a } = setup('sudsy');
    castAbility(w, a, getFighter('sudsy').attack);
    expect(w.projs).toHaveLength(3);
    for (const pr of w.projs) {
      expect(Math.hypot(pr.vx, pr.vy)).toBeCloseTo(330, 5);
      expect(pr.bounces).toBe(2);
    }
  });

  it('Bubble Trap encases the target: no movement, no attacks, 1 s duration', () => {
    const { w, a, b } = setup('sudsy', 300);
    castAbility(w, a, getFighter('sudsy').special);
    run(w, 0.6);
    expect(b.status).toBe('trapped');
    expect(w.snapshotFor(1).players.find((p) => p.id === 2)!.st).toBe(STATUS_BIT.trapped);
    const x0 = b.x;
    const ammo0 = b.ammo;
    for (let i = 0; i < TICK_HZ / 3; i++) {
      w.setInput(2, inp({ seq: 10 + i, mx: -1, atk: true, spc: true }));
      w.step();
    }
    expect(b.x).toBe(x0);
    expect(b.ammo).toBe(ammo0);
    run(w, 1.2); // bubble pops on its own
    expect(b.status).toBeNull();
  });

  it('a spawn shield absorbs the hit entirely: no damage and no status', () => {
    const { w, a, b } = setup('sudsy', 300);
    b.shield = 1;
    castAbility(w, a, getFighter('sudsy').special);
    run(w, 0.6);
    expect(b.hp).toBe(b.mhp);
    expect(b.status).toBeNull();
  });

  it('a trapped victim breaks out early after 25 damage', () => {
    const { w, a, b } = setup('sudsy', 300);
    castAbility(w, a, getFighter('sudsy').special);
    run(w, 0.6);
    expect(b.status).toBe('trapped');
    w.damage(1, b, 20, b.x, b.y);
    expect(b.status).toBe('trapped');
    w.damage(1, b, 5, b.x, b.y);
    expect(b.status).toBeNull();
    expect(w.events.some((e) => e.k === 'status' && e.v === 2 && e.s === 'trapped' && e.sec === 0)).toBe(true);
  });

  it('a stop-on-contact dash with no contact damage still stops on a player', () => {
    const { w, a, b } = setup('default', 150);
    const def: AbilityDef = { kind: 'dash', dist: 400, dur: 0.25, contactDmg: 0, stopOnContact: true };
    expect(castAbility(w, a, def)).toBe(true);
    run(w, 0.4);
    expect(a.dash).toBeNull();
    expect(a.x).toBeLessThan(1300); // stopped on B, not the full 400 px
    expect(b.hp).toBe(b.mhp);
  });

  it('Mega Bubble rolls through and traps everything it touches', () => {
    const { w, a, b } = setup('sudsy', 180);
    const c = w.addPlayer(3, 'C');
    c.x = 1240; c.y = 1000; c.shield = 0;
    castAbility(w, a, getFighter('sudsy').ult);
    expect(w.projs).toHaveLength(1);
    expect(w.projs[0].pierce).toBe(true);
    run(w, 0.7);
    expect(b.status).toBe('trapped');
    expect(c.status).toBe('trapped');
    expect(b.hp).toBe(b.mhp - 14);
    expect(c.hp).toBe(c.mhp - 14);
  });
});
