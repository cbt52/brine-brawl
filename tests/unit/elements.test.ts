import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import {
  applyElementHit, applyStatus, BURN_DPS, CLAP_DMG, CLAP_RANGE, ELEMENT_OF_STATUS, ELEMENT_STATUS,
  FLARE_DMG, MUD_ROOT_SEC, REACTIONS, SHOCK_CHAIN_RANGE, SHOCK_DMG, SHOCK_STUN, SPREAD_RANGE,
  STEAM_RADIUS, STEAM_SEC, STATUS_SEC, STATUS_SPEED, reactionFor, statusSpeedMul,
} from '../../shared/sim/elements.ts';
import { hasStatus, statusMask, STATUS_BIT } from '../../shared/fighters/types.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({
  seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o,
});
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** Two players in open water, A at 700/700 looking right, B `gap` units to the right. */
function setup(gap = 200) {
  const w = new World();
  const a = w.addPlayer(1, 'A', 'default');
  const b = w.addPlayer(2, 'B', 'default');
  a.x = 700; a.y = 700; a.aim = 0;
  b.x = 700 + gap; b.y = 700;
  a.shield = 0; b.shield = 0;
  return { w, a, b };
}

describe('element tables', () => {
  it('maps every element to its status and back', () => {
    expect(ELEMENT_STATUS).toMatchObject({
      neutral: null, water: 'wet', fire: 'burn', volt: 'static', earth: 'heavy', leaf: 'tangled', air: null,
    });
    for (const [el, st] of Object.entries(ELEMENT_STATUS)) {
      if (st) expect(ELEMENT_OF_STATUS[st]).toBe(el);
    }
  });

  it('keeps the design durations and speed penalties', () => {
    expect(STATUS_SEC.tangled).toBe(1);
    expect(STATUS_SEC.wet).toBe(3);
    expect(statusSpeedMul('heavy')).toBe(0.85);
    expect(statusSpeedMul('tangled')).toBe(0.7);
    expect(statusSpeedMul('wet')).toBe(1);
    expect(statusSpeedMul(null)).toBe(1);
    expect(STATUS_SPEED.burn).toBeUndefined();
  });

  it('encodes the snapshot status as a bit mask', () => {
    expect(statusMask('trapped')).toBe(STATUS_BIT.trapped);
    expect(statusMask(null)).toBe(0);
    expect(hasStatus(STATUS_BIT.wet | STATUS_BIT.burn, 'burn')).toBe(true);
    expect(hasStatus(STATUS_BIT.wet, 'burn')).toBe(false);
    expect(hasStatus(0, 'wet')).toBe(false);
  });
});

describe('reaction table', () => {
  it('has exactly the six designed pairs', () => {
    expect(REACTIONS.map((r) => r.id).sort()).toEqual(
      ['flare', 'mud', 'shock', 'steam', 'thunderclap', 'wildfire'],
    );
    expect(reactionFor('wet', 'volt')).toBe('shock');
    expect(reactionFor('wet', 'fire')).toBe('steam');
    expect(reactionFor('burn', 'air')).toBe('flare');
    expect(reactionFor('heavy', 'water')).toBe('mud');
    expect(reactionFor('tangled', 'fire')).toBe('wildfire');
    expect(reactionFor('static', 'air')).toBe('thunderclap');
    // every row carries a popup word for the client
    for (const r of REACTIONS) expect(r.word.length).toBeGreaterThan(2);
    // no pair: plain status application
    expect(reactionFor('wet', 'leaf')).toBeNull();
    expect(reactionFor(null, 'volt')).toBeNull();
    expect(reactionFor('stun', 'air')).toBeNull();
  });

  /** One row per table entry: the reaction fires, is announced and consumes the old status. */
  const rows = REACTIONS.map((r) => ({ ...r }));
  for (const r of rows) {
    it(`${r.status} + ${r.element} → ${r.id}`, () => {
      const { w, a, b } = setup();
      applyStatus(b, r.status);
      const before = b.hp;
      const got = applyElementHit(w, a.id, b, ELEMENT_STATUS[r.element], STATUS_SEC.wet, r.element);
      expect(got).toBe(r.id);
      const ev = w.events.filter((e) => e.k === 'react');
      expect(ev.length).toBeGreaterThanOrEqual(1);
      expect(ev[0]).toMatchObject({ k: 'react', v: b.id, r: r.id });
      // the reaction consumed the old status (mud/wildfire/thunderclap re-apply their own)
      if (r.id !== 'wildfire') expect(b.status).not.toBe(r.status);
      expect(b.hp).toBeLessThanOrEqual(before);
    });
  }

  it('applies a plain status when no pair matches', () => {
    const { w, a, b } = setup();
    expect(applyElementHit(w, a.id, b, 'tangled', 1, 'leaf')).toBeNull();
    expect(b.status).toBe('tangled');
    expect(b.statusLeft).toBe(1);
    expect(w.events.some((e) => e.k === 'react')).toBe(false);
  });

  it('ignores hits on a shielded or downed victim', () => {
    const { w, a, b } = setup();
    applyStatus(b, 'wet');
    b.shield = 1;
    expect(applyElementHit(w, a.id, b, 'static', 3, 'volt')).toBeNull();
    expect(b.status).toBe('wet');
    b.shield = 0;
    b.down = true;
    expect(applyElementHit(w, a.id, b, 'static', 3, 'volt')).toBeNull();
  });
});

describe('reaction effects', () => {
  it('SHOCK stuns and damages, and hops once to the nearest wet fighter', () => {
    const { w, a, b } = setup(200);
    const c = w.addPlayer(3, 'C', 'default');
    c.x = b.x + 180; c.y = b.y; c.shield = 0;
    const d = w.addPlayer(4, 'D', 'default');
    d.x = b.x + 900; d.y = b.y; d.shield = 0;
    applyStatus(b, 'wet'); applyStatus(c, 'wet'); applyStatus(d, 'wet');
    expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeLessThan(SHOCK_CHAIN_RANGE);
    applyElementHit(w, a.id, b, 'static', 3, 'volt');
    expect(b.hp).toBe(b.mhp - SHOCK_DMG);
    expect(b.status).toBe('stun');
    expect(b.statusLeft).toBeCloseTo(SHOCK_STUN, 5);
    // one hop, to the nearest wet victim only
    expect(c.hp).toBe(c.mhp - SHOCK_DMG);
    expect(c.status).toBe('stun');
    expect(d.hp).toBe(d.mhp);
  });

  it('STEAM drops a hiding cloud that the snapshot respects', () => {
    const { w, a, b } = setup(200);
    applyStatus(b, 'wet');
    applyElementHit(w, a.id, b, 'burn', 3, 'fire');
    const cloud = w.zones.find((z) => z.hides);
    expect(cloud).toMatchObject({ x: b.x, y: b.y, r: STEAM_RADIUS, dur: STEAM_SEC });
    expect(b.status).toBeNull();
    // a far watcher cannot see into the cloud, a close one can
    const far = w.addPlayer(3, 'Far', 'default'); far.x = b.x + 600; far.y = b.y; far.shield = 0;
    const near = w.addPlayer(4, 'Near', 'default'); near.x = b.x + 100; near.y = b.y; near.shield = 0;
    expect(w.snapshotFor(far.id).players.some((p) => p.id === b.id)).toBe(false);
    expect(w.snapshotFor(near.id).players.some((p) => p.id === b.id)).toBe(true);
    // the cloud expires after STEAM_SEC
    run(w, STEAM_SEC + 0.2);
    expect(w.zones.some((z) => z.hides)).toBe(false);
    expect(w.snapshotFor(far.id).players.some((p) => p.id === b.id)).toBe(true);
  });

  it('FLARE bursts for 15 and spreads burn inside 120 u only', () => {
    const { w, a, b } = setup(200);
    const near = w.addPlayer(3, 'N', 'default');
    near.x = b.x + SPREAD_RANGE - 10; near.y = b.y; near.shield = 0;
    const far = w.addPlayer(4, 'F', 'default');
    far.x = b.x + SPREAD_RANGE + 40; far.y = b.y; far.shield = 0;
    applyStatus(b, 'burn');
    applyElementHit(w, a.id, b, null, 0, 'air');
    expect(b.hp).toBe(b.mhp - FLARE_DMG);
    expect(near.status).toBe('burn');
    expect(far.status).toBeNull();
  });

  it('MUD roots for 0.8 s without taking the attacks away', () => {
    const { w, a, b } = setup(200);
    applyStatus(b, 'heavy');
    applyElementHit(w, a.id, b, 'wet', 3, 'water');
    expect(b.rootLeft).toBeCloseTo(MUD_ROOT_SEC, 5);
    const x0 = b.x;
    const ammo0 = b.ammo;
    w.setInput(b.id, inp({ mx: 1, atk: true, seq: 2 }));
    run(w, MUD_ROOT_SEC - 0.1);
    expect(b.x).toBeCloseTo(x0, 5); // rooted: no walking
    expect(b.ammo).toBeLessThan(ammo0); // but the attack still fires
    run(w, 0.4);
    expect(b.x).toBeGreaterThan(x0); // root over, walking again
  });

  it('WILDFIRE doubles the burn and spreads it', () => {
    const { w, a, b } = setup(200);
    const near = w.addPlayer(3, 'N', 'default');
    near.x = b.x + 60; near.y = b.y; near.shield = 0;
    applyStatus(b, 'tangled');
    applyElementHit(w, a.id, b, 'burn', 0, 'fire');
    expect(b.status).toBe('burn');
    expect(b.statusLeft).toBeCloseTo(STATUS_SEC.burn * 2, 5);
    expect(near.status).toBe('burn');
    expect(near.statusLeft).toBeCloseTo(STATUS_SEC.burn, 5);
  });

  it('THUNDERCLAP hits a 120 u area for 12 and knocks back', () => {
    const { w, a, b } = setup(200);
    const near = w.addPlayer(3, 'N', 'default');
    near.x = b.x + CLAP_RANGE - 20; near.y = b.y; near.shield = 0;
    applyStatus(b, 'static');
    const nx0 = near.x;
    applyElementHit(w, a.id, b, null, 0, 'air');
    expect(b.hp).toBe(b.mhp - CLAP_DMG);
    expect(near.hp).toBe(near.mhp - CLAP_DMG);
    expect(near.x).toBeGreaterThan(nx0);
  });
});

describe('status effects', () => {
  it('burn ticks 4 dmg/s in half-second chunks', () => {
    const { w, b } = setup();
    applyStatus(b, 'burn');
    run(w, 0.4);
    expect(b.hp).toBe(b.mhp); // first chunk not due yet
    run(w, 0.2);
    expect(b.hp).toBe(b.mhp - BURN_DPS * 0.5);
    run(w, 1);
    expect(b.hp).toBe(b.mhp - BURN_DPS * 1.5);
  });

  it('burn stops when the status runs out and is not applied through a shield', () => {
    const { w, a, b } = setup();
    applyStatus(b, 'burn', 0.6);
    run(w, 2);
    expect(b.status).toBeNull();
    expect(b.hp).toBeGreaterThan(b.mhp - 3 * BURN_DPS);
    b.shield = 1;
    applyElementHit(w, a.id, b, 'burn', 3, 'fire');
    expect(b.status).toBeNull();
  });

  it('heavy and tangled slow the walk by 15 % / 30 %', () => {
    const walk = (status: 'wet' | 'heavy' | 'tangled' | null): number => {
      const { w, b } = setup();
      if (status) applyStatus(b, status, 9);
      // open water, away from docks and kelp, so nothing blocks the walk
      b.x = 760; b.y = 760;
      w.setInput(b.id, inp({ mx: 1, seq: 2 }));
      run(w, 0.5);
      return b.x - 760;
    };
    const base = walk(null);
    expect(walk('wet')).toBeCloseTo(base, 5);
    expect(walk('heavy')).toBeCloseTo(base * 0.85, 5);
    expect(walk('tangled')).toBeCloseTo(base * 0.7, 5);
  });
});
