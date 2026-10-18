import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { getFighter, SELECTABLE } from '../../shared/fighters/index.ts';
import { hasStatus, statusMask, type SummonAbility } from '../../shared/fighters/types.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** A turret kit, so T32 can lean on the primitive without inventing a fighter first. */
const TURRET: SummonAbility = {
  kind: 'summon', type: 'turret', sec: 4, hp: 50, radius: 20, dist: 80,
  fireEvery: 0.5, dmg: 9, range: 400, element: 'volt', status: 'static', statusSec: 1,
};

/** The Saltwind trio of CP8: Nova Chartwind, Longshot Lenny, Doc Fawnsworth. */
describe('Saltwind roster (CP8)', () => {
  it('all three are selectable with a cooldown on their special', () => {
    const ids = SELECTABLE.map((f) => f.id);
    for (const id of ['nova', 'lenny', 'fawnsworth']) expect(ids).toContain(id);
    const n = getFighter('nova');
    const l = getFighter('lenny');
    const f = getFighter('fawnsworth');
    expect([n.name, l.name, f.name]).toEqual(['Nova Chartwind', 'Longshot Lenny', 'Doc Fawnsworth']);
    expect([n.element, l.element, f.element]).toEqual(['air', 'neutral', 'leaf']);
    for (const kit of [n, l, f]) {
      expect(kit.faction).toBe('saltwind');
      expect(kit.special.cd).toBeGreaterThan(0);
    }
  });

  it('Nova: Mist Orb leaves the target soaking wet', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Nova', 'nova');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1160; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('nova').attack, 'attack');
    run(w, 0.4);
    expect(b.status).toBe('wet');
    expect(b.hp).toBeLessThan(b.mhp);
  });

  it('Nova: Storm Cloud wets everybody standing under it', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Nova', 'nova');
    const b = w.addPlayer(2, 'B', 'default');
    const c = w.addPlayer(3, 'C', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1290; b.y = 1030; // under the cloud (aim point 1300, 300 u out)
    c.x = 1290; c.y = 890;
    for (const p of [a, b, c]) p.shield = 0;
    castAbility(w, a, getFighter('nova').special, 'special');
    run(w, 1);
    expect(b.status).toBe('wet');
    expect(c.status).toBe('wet');
    expect(a.hp).toBe(a.mhp);
  });

  it('Nova: Lightning Chart charts five separate strikes and hits the middle one', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Nova', 'nova');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1300; b.y = 1000; // on the aim point in front of her
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('nova').ult, 'ult');
    expect(w.zones.length).toBe(5);
    run(w, 0.8);
    expect(b.hp).toBeLessThan(b.mhp);
    expect(w.zones.length).toBe(0);
  });

  it('Nova: one bolt alone does not carpet the whole fan', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Nova', 'nova');
    const behind = w.addPlayer(2, 'behind', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    behind.x = 860; behind.y = 1000; // straight behind her, outside the 100° chart
    a.shield = 0; behind.shield = 0;
    castAbility(w, a, getFighter('nova').ult, 'ult');
    run(w, 0.8);
    expect(behind.hp).toBe(behind.mhp);
  });

  it('Lenny: Fib Shot carries across the arena', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lenny', 'lenny');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 800; a.y = 1000; a.aim = 0;
    b.x = 1700; b.y = 1000; b.aim = Math.PI; // 900 u of open dock: no crate in the lane
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('lenny').attack, 'attack');
    run(w, 0.9);
    expect(b.hp).toBe(b.mhp - 18); // T33: fib shot 24 → 18
  });

  it('Lenny: the decoy soaks an enemy shot and leaves the real Lenny untouched', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lenny', 'lenny');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1260; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('lenny').special, 'special');
    expect(w.summons.length).toBe(1);
    expect(w.summons[0].x).toBeCloseTo(1090, 0);
    castAbility(w, b, getFighter('default').attack, 'attack');
    run(w, 0.6);
    expect(a.hp).toBe(a.mhp); // the shot never reached him
    expect(w.summons[0]?.hp ?? 0).toBeLessThan(70);
  });

  it('a piercing shot damages a decoy exactly once (review 20261018-055109)', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lenny', 'lenny');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 800; b.y = 1000; b.aim = 0; // shoots east through the decoy
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('lenny').special, 'special');
    const decoy = w.summons[0];
    expect(decoy).toBeTruthy();
    const before = decoy.hp;
    castAbility(w, b, { kind: 'projectile', count: 1, spread: 0, speed: 900, range: 600, dmg: 6, radius: 8, pierce: true }, 'attack');
    run(w, 0.6);
    expect(decoy.hp).toBe(before - 6); // not 4+ sub-step hits
  });

  it('Lenny: the decoy expires on its own clock and does not block his own shots', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lenny', 'lenny');
    a.x = 1000; a.y = 1000; a.aim = 0;
    a.shield = 0;
    castAbility(w, a, getFighter('lenny').special, 'special');
    // his own projectile flies through the decoy instead of popping it
    castAbility(w, a, getFighter('lenny').attack, 'attack');
    run(w, 0.3);
    expect(w.summons.length).toBe(1);
    run(w, 5);
    expect(w.summons.length).toBe(0);
  });

  it('Lenny: The Big Fib lobs over a wall and bursts where it lands', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Lenny', 'lenny');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1400; b.y = 1000; b.aim = Math.PI;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, getFighter('lenny').ult, 'ult');
    expect(w.projs[0].lob).toBe(true);
    run(w, 1.4);
    // 8 contact damage plus the 34 dmg burst where the duck goes off
    expect(b.hp).toBeLessThanOrEqual(b.mhp - 8);
    expect(b.hp).toBeGreaterThan(0);
  });

  it('Fawnsworth: Remedy Dart heals a crewmate instead of hurting it', () => {
    const w = new World();
    const doc = w.addPlayer(1, 'Doc', 'fawnsworth');
    const ally = w.addPlayer(2, 'Ally', 'default');
    doc.x = 1000; doc.y = 1000; doc.aim = 0;
    ally.x = 1150; ally.y = 1000; ally.aim = Math.PI;
    doc.shield = 0; ally.shield = 0;
    doc.team = 0; ally.team = 0;
    ally.hp = 40;
    castAbility(w, doc, getFighter('fawnsworth').attack, 'attack');
    run(w, 0.5);
    expect(ally.hp).toBe(60);
    expect(w.events.some((e) => e.k === 'heal' && e.v === ally.id)).toBe(true);
  });

  it('Fawnsworth: the same dart still stings an enemy', () => {
    const w = new World();
    const doc = w.addPlayer(1, 'Doc', 'fawnsworth');
    const foe = w.addPlayer(2, 'Foe', 'default');
    doc.x = 1000; doc.y = 1000; doc.aim = 0;
    foe.x = 1150; foe.y = 1000; foe.aim = Math.PI;
    doc.shield = 0; foe.shield = 0;
    doc.team = 0; foe.team = 1;
    castAbility(w, doc, getFighter('fawnsworth').attack, 'attack');
    run(w, 0.5);
    expect(foe.hp).toBe(foe.mhp - 16); // T33: remedy dart 12 → 16
  });

  it('Fawnsworth: Grow Form halves incoming damage for its four seconds', () => {
    const w = new World();
    const doc = w.addPlayer(1, 'Doc', 'fawnsworth');
    const foe = w.addPlayer(2, 'Foe', 'default');
    doc.x = 1000; doc.y = 1000;
    doc.shield = 0;
    castAbility(w, doc, getFighter('fawnsworth').special, 'special');
    doc.hp = 100; // baseline after the buff's own 10 HP patch-up
    w.damage(foe.id, doc, 20, doc.x, doc.y);
    expect(doc.hp).toBe(90);
    run(w, 4.2);
    w.damage(foe.id, doc, 20, doc.x, doc.y);
    expect(doc.hp).toBe(70);
  });

  it('Fawnsworth: Field Surgery patches up crew inside the tent but not the enemy', () => {
    const w = new World();
    const doc = w.addPlayer(1, 'Doc', 'fawnsworth');
    const ally = w.addPlayer(2, 'Ally', 'default');
    const foe = w.addPlayer(3, 'Foe', 'default');
    doc.x = 1000; doc.y = 1000;
    ally.x = 1060; ally.y = 1000;
    foe.x = 1000; foe.y = 1050;
    doc.team = 0; ally.team = 0; foe.team = 1;
    doc.hp = 60; ally.hp = 50; foe.hp = 80;
    for (const p of [doc, ally, foe]) p.shield = 0;
    castAbility(w, doc, getFighter('fawnsworth').ult, 'ult');
    run(w, 1.2);
    expect(doc.hp).toBeGreaterThan(60);
    expect(ally.hp).toBeGreaterThan(50);
    expect(foe.hp).toBe(80);
  });

  it('a bot Fawnsworth presses Grow Form in melee and Field Surgery once it is charged', () => {
    const w = new World();
    const doc = w.addPlayer(7, 'DocBot', 'fawnsworth', true);
    const foe = w.addPlayer(8, 'Foe', 'default');
    doc.x = 1000; doc.y = 1000;
    foe.x = 1180; foe.y = 1000; // inside the buff's reach
    doc.shield = 0; foe.shield = 0;
    doc.hp = 40;
    doc.uc = doc.def.ultCharge; // an ult ready to spend
    const brain = new BotBrain(7, 'normal', () => 0.5);
    let spc = false;
    let ult = false;
    for (let i = 0; i < 4; i++) {
      const input = brain.think(w, 1 / TICK_HZ);
      spc ||= input.spc;
      ult ||= input.ult;
    }
    expect(spc).toBe(true);
    expect(ult).toBe(true);
  });

  it('the summon primitive supports turrets that shoot the nearest enemy (T32)', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Turret', 'default');
    const b = w.addPlayer(2, 'B', 'default');
    a.x = 1000; a.y = 1000; a.aim = 0;
    b.x = 1250; b.y = 1000;
    a.shield = 0; b.shield = 0;
    castAbility(w, a, TURRET, 'special');
    expect(w.summons[0].kind).toBe('turret');
    const hp0 = b.hp;
    run(w, 1.6);
    expect(b.hp).toBeLessThan(hp0);
    expect(hasStatus(statusMask(b.status), 'static')).toBe(true);
  });
});
