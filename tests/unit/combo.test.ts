import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { COMBO_BURST_RADIUS, comboName, comboPartner, type UltHit } from '../../shared/sim/combo.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import type { Team } from '../../shared/sim/teams.ts';

const hit = (o: Partial<UltHit> = {}): UltHit => ({
  id: 1, team: 0, el: 'fire', x: 1000, y: 1000, v: 3, tick: 0, dmg: 20, ...o,
});

describe('crew combos (T28)', () => {
  it('names the element pairs and falls back to the plain banner', () => {
    expect(comboName('volt', 'water')).toBe('Storm Surge');
    expect(comboName('water', 'volt')).toBe('Storm Surge');
    expect(comboName('fire', 'air')).toBe('Firenado');
    expect(comboName('air', 'fire')).toBe('Firenado');
    expect(comboName('earth', 'water')).toBe('Mudslide');
    expect(comboName('leaf', 'water')).toBe('Bloom Burst');
    expect(comboName('fire', 'earth')).toBe('Magma Pop');
    expect(comboName('volt', 'leaf')).toBe('Crew Combo!');
  });

  it('needs a teammate, the same enemy (or 300 u) and a 1.5 s window', () => {
    const me = hit({ id: 2, tick: 30 });
    // a teammate's ult on the same victim pairs up
    expect(comboPartner([hit({ id: 1, tick: 10 })], me)?.id).toBe(1);
    // a different victim farther than the radius does not
    expect(comboPartner([hit({ id: 1, v: 4, x: 1000 + 301, tick: 10 })], me)).toBeNull();
    // … but one inside the radius does
    expect(comboPartner([hit({ id: 1, v: 4, x: 1000 + 299, tick: 10 })], me)?.id).toBe(1);
    // the same fighter can never combo with itself
    expect(comboPartner([hit({ id: 2, tick: 10 })], me)).toBeNull();
    // enemies (different crew) and free-for-alls never pair
    expect(comboPartner([hit({ id: 1, team: 1, tick: 10 })], me)).toBeNull();
    expect(comboPartner([hit({ id: 1, team: null, tick: 10 })], { ...me, team: null })).toBeNull();
    // outside the window it is stale
    const late = Math.round(1.5 * TICK_HZ) + 1;
    expect(comboPartner([hit({ id: 1, tick: 0 })], { ...me, tick: late })).toBeNull();
    expect(comboPartner([hit({ id: 1, tick: 0 })], { ...me, tick: late - 2 })?.id).toBe(1);
  });

  it('fires a named +40 % burst when two crewmates land their ults', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Volt', 'voltbun', false, 0 as Team);
    const b = w.addPlayer(2, 'Mira', 'mira', false, 0 as Team);
    const foe = w.addPlayer(3, 'Foe', 'default', false, 1 as Team);
    for (const p of [a, b, foe]) p.shield = 0;
    a.x = 1000; a.y = 1000;
    b.x = 1040; b.y = 1000;
    foe.x = 1080; foe.y = 1000;
    w.clearEvents();

    w.damage(a.id, foe, 20, foe.x, foe.y, 'ult');
    expect(w.events.some((e) => e.k === 'combo')).toBe(false);

    const hpBefore = foe.hp;
    w.damage(b.id, foe, 20, foe.x, foe.y, 'ult');
    const combo = w.events.find((e) => e.k === 'combo');
    expect(combo).toBeTruthy();
    if (combo?.k !== 'combo') throw new Error('no combo event');
    expect(combo.n).toBe('Storm Surge');
    expect([combo.a, combo.b].sort()).toEqual([a.id, b.id]);
    // the second hit plus the +40 % burst landed on the victim standing in the blast
    expect(hpBefore - foe.hp).toBe(28);
  });

  it('keeps a buried enemy out of the bonus burst', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Volt', 'voltbun', false, 0 as Team);
    const b = w.addPlayer(2, 'Mira', 'mira', false, 0 as Team);
    const foe = w.addPlayer(3, 'Foe', 'default', false, 1 as Team);
    const burrower = w.addPlayer(4, 'Mole', 'default', false, 1 as Team);
    for (const p of [a, b, foe, burrower]) p.shield = 0;
    a.x = 1000; a.y = 1000;
    b.x = 1040; b.y = 1000;
    foe.x = 1080; foe.y = 1000;
    burrower.x = 1100; burrower.y = 1000;
    burrower.burrow = { left: 1, tx: 1100, ty: 1000, radius: 0, dmg: 0, status: null, statusSec: 0 };
    const buriedHp = burrower.hp;
    w.clearEvents();
    w.damage(a.id, foe, 20, foe.x, foe.y, 'ult');
    w.damage(b.id, foe, 20, foe.x, foe.y, 'ult');
    expect(w.events.some((e) => e.k === 'combo')).toBe(true);
    expect(burrower.hp).toBe(buriedHp);
    expect(burrower.hp).toBeGreaterThan(0);
  });

  it('does not pair ults from rival crews', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Volt', 'voltbun', false, 0 as Team);
    const b = w.addPlayer(2, 'Mira', 'mira', false, 1 as Team);
    const foe = w.addPlayer(3, 'Foe', 'default', false, 1 as Team);
    for (const p of [a, b, foe]) p.shield = 0;
    a.x = 1000; a.y = 1000;
    b.x = 1040; b.y = 1000;
    foe.x = 1080; foe.y = 1000;
    w.clearEvents();
    w.damage(a.id, foe, 20, foe.x, foe.y, 'ult');
    w.damage(b.id, foe, 20, foe.x, foe.y, 'ult');
    expect(w.events.some((e) => e.k === 'combo')).toBe(false);
  });

  it('only ults count — attack and special damage never pair up', () => {
    const w = new World();
    const a = w.addPlayer(1, 'Volt', 'voltbun', false, 0 as Team);
    const b = w.addPlayer(2, 'Mira', 'mira', false, 0 as Team);
    const foe = w.addPlayer(3, 'Foe', 'default', false, 1 as Team);
    for (const p of [a, b, foe]) p.shield = 0;
    w.clearEvents();
    w.damage(a.id, foe, 20, foe.x, foe.y, 'attack');
    w.damage(b.id, foe, 20, foe.x, foe.y, 'special');
    w.damage(a.id, foe, 20, foe.x, foe.y);
    expect(w.events.some((e) => e.k === 'combo')).toBe(false);
    expect(COMBO_BURST_RADIUS).toBeGreaterThan(0);
  });
});
