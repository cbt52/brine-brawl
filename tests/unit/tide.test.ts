import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { SHALLOWS } from '../../shared/arena/docks.ts';
import {
  CHEST_HP, CHEST_SPOTS, PICKUP_HEAL, PICKUP_SEC, TIDE_CYCLE_SEC, TIDE_FALL_SEC, TIDE_HIGH_SEC,
  TIDE_LOW_SEC, TIDE_RISE_SEC, Tide, WATER_SLOW, WATER_WET_SEC, inWater, phaseSec, pickupFor, tideLevel,
  waterRects, waterSpeedMul,
} from '../../shared/sim/tide.ts';
import { SHOCK_DMG, SHOCK_CHAIN_RANGE, applyElementHit } from '../../shared/sim/elements.ts';
import { hasStatus, statusMask } from '../../shared/fighters/types.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import { BASE_SPEED } from '../../shared/sim/world.ts';
import { seeded } from '../../scripts/lib/balance.ts';

const POOL = SHALLOWS[0];
const POOL_CENTRE = { x: POOL.x + POOL.w / 2, y: POOL.y + POOL.h / 2 };
/** open sand far from the shallows */
const DRY = { x: 400, y: 300 };

const run = (w: World, sec: number) => { for (let i = 0; i < Math.round(sec * TICK_HZ); i++) w.step(); };

/** A world sitting at the start of `phase`, with the scripted tide advanced to it. */
function atPhase(phase: 'low' | 'rising' | 'high' | 'falling'): World {
  const w = new World();
  w.tide.force(phase);
  return w;
}

/** A world whose tide has cycled into a low phase (chests are stocked by the first low step). */
function withChests(): World {
  const w = new World();
  w.tide.force('falling');
  run(w, TIDE_FALL_SEC + 0.2);
  return w;
}

describe('tide clock', () => {
  it('cycles low → rising → high → falling in one minute', () => {
    expect(phaseSec('low') + phaseSec('rising') + phaseSec('high') + phaseSec('falling')).toBe(TIDE_CYCLE_SEC);
    expect(TIDE_CYCLE_SEC).toBe(60);
    expect(phaseSec('high')).toBe(TIDE_HIGH_SEC);
    expect(phaseSec('low')).toBe(TIDE_LOW_SEC);
    const t = new Tide();
    expect(t.phase).toBe('low');
    const seen: string[] = [];
    for (let i = 0; i < TIDE_CYCLE_SEC * TICK_HZ; i++) {
      const entered = t.step(1 / TICK_HZ);
      if (entered) seen.push(entered);
    }
    expect(seen).toEqual(['rising', 'high', 'falling', 'low']);
  });

  it('gives a 5 s warning before the flood arrives', () => {
    expect(TIDE_RISE_SEC).toBe(5);
    const t = new Tide();
    t.force('rising');
    expect(t.level).toBe(0);
    expect(tideLevel('rising', 2.5)).toBeCloseTo(0.5, 5);
    expect(tideLevel('rising', 0)).toBe(1);
    expect(tideLevel('high', 9)).toBe(1);
    expect(tideLevel('falling', TIDE_FALL_SEC)).toBe(1);
    expect(tideLevel('falling', 0)).toBe(0);
    // stepping through the ramp ends in high tide after exactly the warning window
    t.elapsed = 0;
    let entered = null as string | null;
    let sec = 0;
    while (!entered && sec < 10) { entered = t.step(1 / 30); sec += 1 / 30; }
    expect(entered).toBe('high');
    expect(sec).toBeCloseTo(TIDE_RISE_SEC, 1);
  });

  it('shrinks the pool at low tide and floods it at high tide', () => {
    expect(waterRects(0)[0].w).toBeLessThan(POOL.w);
    expect(waterRects(1)[0]).toMatchObject({ x: POOL.x, y: POOL.y, w: POOL.w, h: POOL.h });
    expect(inWater(POOL_CENTRE.x, POOL_CENTRE.y, 1)).toBe(true);
    expect(inWater(POOL_CENTRE.x, POOL_CENTRE.y, 0)).toBe(false);
    expect(inWater(DRY.x, DRY.y, 1)).toBe(false);
    expect(waterSpeedMul(DRY.x, DRY.y, 1)).toBe(1);
    expect(waterSpeedMul(POOL_CENTRE.x, POOL_CENTRE.y, 1)).toBe(WATER_SLOW);
  });
});

describe('treasure chests', () => {
  it('is already stocked on the first step of a fresh round (round start is low tide)', () => {
    const w = new World();
    expect(w.tide.phase).toBe('low');
    expect(w.chests).toHaveLength(0); // nothing before the first tick
    w.step();
    expect(w.chests).toHaveLength(CHEST_SPOTS.length);
    // a new round restocks the pools instead of waiting for the next low tide
    w.chests = [];
    w.resetScores();
    w.step();
    expect(w.chests).toHaveLength(CHEST_SPOTS.length);
  });

  it('keeps a picked-clean pool empty until the tide comes back in', () => {
    const w = withChests();
    w.chests = [];
    run(w, 1);
    expect(w.tide.phase).toBe('low');
    expect(w.chests).toHaveLength(0);
  });

  it('a debug tide jump re-syncs the loot (?tide=low shows chests)', () => {
    const w = new World();
    w.debugTide('high');
    expect(w.chests).toHaveLength(0);
    w.debugTide('low');
    expect(w.chests).toHaveLength(CHEST_SPOTS.length);
  });

  it('surfaces at low tide and is swallowed by the rising flood', () => {
    const w = withChests();
    expect(w.tide.phase).toBe('low');
    expect(w.chests).toHaveLength(CHEST_SPOTS.length);
    expect(w.chests.map((c) => [c.x, c.y])).toEqual(CHEST_SPOTS.map((s) => [s.x, s.y]));
    expect(w.chests[0].hp).toBe(CHEST_HP);
    // snapshot carries them
    expect(w.snapshotFor(0).chests).toHaveLength(CHEST_SPOTS.length);
    // the flood eats what is left
    run(w, TIDE_LOW_SEC + 0.2);
    expect(w.tide.phase).toBe('rising');
    expect(w.chests).toHaveLength(0);
    expect(w.snapshotFor(0).chests).toHaveLength(0);
  });

  it('is damaged by a shot and pops open into a pickup', () => {
    const w = withChests();
    const a = w.addPlayer(1, 'A', 'default');
    a.shield = 0;
    const chest = w.chests[0];
    // chip it with real damage first (the chest survives)
    w.damageChest(1, chest, CHEST_HP / 2);
    expect(chest.hp).toBe(CHEST_HP / 2);
    expect(w.chests).toHaveLength(CHEST_SPOTS.length);
    expect(a.uc).toBeGreaterThan(0); // hitting a chest feeds the ult
    // now break it
    w.damageChest(1, chest, CHEST_HP);
    expect(w.chests).toHaveLength(CHEST_SPOTS.length - 1);
    expect(w.events.some((e) => e.k === 'chest')).toBe(true);
    expect(w.picks).toHaveLength(1);
    expect(w.picks[0].kind).toBe(pickupFor(0));
    expect(w.picks[0].left).toBe(PICKUP_SEC);
  });

  it('drops a healing reward a fighter can walk over', () => {
    const w = withChests();
    const a = w.addPlayer(1, 'A', 'default');
    a.shield = 0;
    a.hp = 30;
    a.x = DRY.x; a.y = DRY.y;
    // break it and force a heal drop next to the fighter
    w.damageChest(1, w.chests[0], CHEST_HP * 2);
    w.picks[0].kind = 'heal';
    w.picks[0].x = a.x + 6;
    w.picks[0].y = a.y;
    run(w, 0.2);
    expect(w.picks).toHaveLength(0);
    expect(a.hp).toBeGreaterThan(30);
    expect(a.hp - 30).toBeGreaterThanOrEqual(Math.min(PICKUP_HEAL, a.mhp - 30));
    expect(w.events.some((e) => e.k === 'pick' && e.kind === 'heal')).toBe(true);
  });

  it('counts doubloons for a gold reward', () => {
    const w = withChests();
    const a = w.addPlayer(1, 'A', 'default');
    a.shield = 0;
    a.x = DRY.x; a.y = DRY.y;
    w.damageChest(1, w.chests[0], CHEST_HP * 2);
    w.picks[0].kind = 'gold';
    w.picks[0].x = a.x + 4;
    w.picks[0].y = a.y;
    const gold0 = a.gold;
    run(w, 0.2);
    expect(a.gold).toBe(gold0 + 1);
  });
});

describe('flooded water', () => {
  it('slows movement while wading', () => {
    const dryRun = new World();
    dryRun.tide.force('low');
    const d = dryRun.addPlayer(1, 'A', 'default');
    d.shield = 0;
    d.x = DRY.x; d.y = DRY.y;
    const wetRun = new World();
    wetRun.tide.force('high');
    const w = wetRun.addPlayer(1, 'A', 'default');
    w.shield = 0;
    w.x = POOL_CENTRE.x; w.y = POOL_CENTRE.y;
    const input = { seq: 1, mx: 1, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false };
    for (const world of [dryRun, wetRun]) {
      world.setInput(1, input);
      run(world, 0.5);
    }
    const dryDist = d.x - DRY.x;
    const wetDist = w.x - POOL_CENTRE.x;
    expect(dryDist).toBeGreaterThan(0);
    expect(wetDist).toBeGreaterThan(0);
    expect(wetDist).toBeLessThan(dryDist); // the flood drags
    expect(wetDist / dryDist).toBeCloseTo(WATER_SLOW, 1);
  });

  it('soaks a fighter standing in high tide', () => {
    const w = atPhase('high');
    const a = w.addPlayer(1, 'A', 'default');
    a.shield = 0;
    a.x = POOL_CENTRE.x; a.y = POOL_CENTRE.y;
    run(w, WATER_WET_SEC + 0.15);
    expect(hasStatus(statusMask(a.status), 'wet')).toBe(true);
    expect(a.waterT).toBeGreaterThanOrEqual(0);
    // and a fighter on dry sand stays dry
    const dry = atPhase('high');
    const b = dry.addPlayer(1, 'B', 'default');
    b.shield = 0;
    b.x = DRY.x; b.y = DRY.y;
    run(dry, WATER_WET_SEC + 0.15);
    expect(b.status).not.toBe('wet');
  });

  it('stays dry at low tide', () => {
    const w = atPhase('low');
    const a = w.addPlayer(1, 'A', 'default');
    a.shield = 0;
    a.x = POOL_CENTRE.x; a.y = POOL_CENTRE.y;
    run(w, WATER_WET_SEC + 0.2);
    expect(a.status).not.toBe('wet');
    expect(w.inWaterAt(a.x, a.y)).toBe(false);
  });
});

describe('shock chain through the flood', () => {
  it('hops from a wet victim to a dry fighter standing in tide water', () => {
    const w = atPhase('high');
    const a = w.addPlayer(1, 'A', 'default');
    const v = w.addPlayer(2, 'V', 'default');
    const o = w.addPlayer(3, 'O', 'default');
    a.shield = 0; v.shield = 0; o.shield = 0;
    a.x = DRY.x; a.y = DRY.y;
    // the wet victim just outside the pool, the dry neighbour inside the flood, well within range
    v.x = POOL.x - 30; v.y = POOL_CENTRE.y;
    o.x = POOL.x + 30; o.y = POOL_CENTRE.y;
    expect(Math.hypot(o.x - v.x, o.y - v.y)).toBeLessThanOrEqual(SHOCK_CHAIN_RANGE);
    expect(w.inWaterAt(o.x, o.y)).toBe(true);
    v.status = 'wet';
    v.statusLeft = 3;
    const hp = o.hp;
    const react = applyElementHit(w, 1, v, 'static', 3, 'volt');
    expect(react).toBe('shock');
    expect(o.hp).toBeLessThan(hp);
    expect(hp - o.hp).toBeGreaterThanOrEqual(SHOCK_DMG - 1);
    expect(w.events.some((e) => e.k === 'react' && e.r === 'shock' && e.v === 3)).toBe(true);
  });
});

describe('bots and the tide', () => {
  it('leaves high-tide water instead of wading straight across', () => {
    const w = atPhase('high');
    const a = w.addPlayer(1, 'bot', 'default', true);
    a.shield = 0;
    a.x = POOL_CENTRE.x; a.y = POOL_CENTRE.y;
    const brain = new BotBrain(1, 'normal', seeded(7));
    let wasIn = false;
    for (let i = 0; i < 3 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
      if (w.inWaterAt(a.x, a.y)) wasIn = true;
    }
    expect(wasIn).toBe(true); // it started inside the flood
    expect(w.inWaterAt(a.x, a.y)).toBe(false); // and it got out
  });

  it('does not cross the flooded pool to reach a target on the far side', () => {
    const w = atPhase('high');
    const a = w.addPlayer(1, 'bot', 'default', true);
    const b = w.addPlayer(2, 'enemy');
    a.shield = 0; b.shield = 0;
    a.x = POOL.x - 220; a.y = POOL_CENTRE.y;
    b.x = POOL.x + POOL.w + 120; b.y = POOL_CENTRE.y;
    const brain = new BotBrain(1, 'normal', seeded(11));
    for (let i = 0; i < 3 * TICK_HZ; i++) {
      w.setInput(1, brain.think(w, 1 / TICK_HZ));
      w.step();
    }
    // it may hug the shore or stray in, but it must never traverse the flooded pool
    expect(a.x).toBeLessThan(POOL.x + POOL.w);
    // and the wading visibly slows it down versus open sand
    expect(a.x - (POOL.x - 220)).toBeLessThan(BASE_SPEED * 3 * 0.85);
  });
});
