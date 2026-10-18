import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import {
  JELLY_COUNT, JELLY_DASH, JELLY_DASH_EVERY, JELLY_DRIFT, JELLY_R, JELLY_STING, JELLY_STING_CD,
  jellyLunging, jellyTouches, makeJellies, stepJellies, type Jelly,
} from '../../shared/sim/jellies.ts';
import { pickWeather, WEATHER_NAMES } from '../../shared/sim/weather.ts';
import { TICK_HZ, WORLD_H, WORLD_W } from '../../shared/constants.ts';

const DT = 1 / TICK_HZ;
const jelly = (x: number, y: number, t = 2, head = 0): Jelly => ({ id: 1, x, y, r: JELLY_R, head, t, cd: new Map() });

describe('jellyfish layout', () => {
  it('lays out the jellies inside the arena with their own ids', () => {
    const list = makeJellies();
    expect(list).toHaveLength(JELLY_COUNT);
    for (const j of list) {
      expect(j.x).toBeGreaterThan(j.r);
      expect(j.x).toBeLessThan(WORLD_W - j.r);
      expect(j.y).toBeGreaterThan(j.r);
      expect(j.y).toBeLessThan(WORLD_H - j.r);
    }
    expect(new Set(list.map((j) => j.id)).size).toBe(JELLY_COUNT);
  });

  it('rolls jelly rain on the top third of the weather roll', () => {
    expect(pickWeather(0.4)).toBe('jelly-rain');
    expect(pickWeather(0.499)).toBe('jelly-rain');
    expect(pickWeather(0.4, 'showdown')).toBe('jelly-rain');
    expect(WEATHER_NAMES['jelly-rain']).toBe('JELLY RAIN');
  });
});

describe('jellyfish motion', () => {
  it('drifts at JELLY_DRIFT and lunges at JELLY_DASH', () => {
    const drift = [jelly(600, 600, 2)];
    stepJellies(drift, DT);
    expect(Math.hypot(drift[0].x - 600, drift[0].y - 600)).toBeCloseTo(JELLY_DRIFT * DT, 5);

    const lunge = [jelly(600, 600, 0)];
    expect(jellyLunging(lunge[0])).toBe(true);
    stepJellies(lunge, DT);
    expect(Math.hypot(lunge[0].x - 600, lunge[0].y - 600)).toBeCloseTo(JELLY_DASH * DT, 5);
  });

  it('lunges once per JELLY_DASH_EVERY seconds', () => {
    expect(jellyLunging(jelly(0, 0, 0))).toBe(true);
    expect(jellyLunging(jelly(0, 0, JELLY_DASH_EVERY))).toBe(true);
    expect(jellyLunging(jelly(0, 0, JELLY_DASH_EVERY / 2))).toBe(false);
  });

  it('bounces off the arena edges and stays inside for two minutes', () => {
    const list = makeJellies();
    for (let i = 0; i < 120 * TICK_HZ; i++) {
      stepJellies(list, DT);
      for (const j of list) {
        expect(j.x).toBeGreaterThanOrEqual(j.r - 1e-9);
        expect(j.x).toBeLessThanOrEqual(WORLD_W - j.r + 1e-9);
        expect(j.y).toBeGreaterThanOrEqual(j.r - 1e-9);
        expect(j.y).toBeLessThanOrEqual(WORLD_H - j.r + 1e-9);
      }
    }
  });

  it('ticks the sting cooldowns down and drops the spent ones', () => {
    const list = [jelly(600, 600)];
    list[0].cd.set(7, 0.5);
    stepJellies(list, 0.3);
    expect(list[0].cd.get(7)).toBeCloseTo(0.2, 5);
    stepJellies(list, 0.3);
    expect(list[0].cd.has(7)).toBe(false);
  });
});

describe('jellyfish overlap', () => {
  it('counts a body whose circle touches the jelly', () => {
    const j = jelly(600, 600);
    expect(jellyTouches(j, 600, 600, 32)).toBe(true);
    expect(jellyTouches(j, 600 + JELLY_R + 31, 600, 32)).toBe(true);
    expect(jellyTouches(j, 600 + JELLY_R + 33, 600, 32)).toBe(false);
  });
});

describe('jellyfish in the sim', () => {
  it('a calm round has no jellies and no jl in the snapshot', () => {
    const w = new World();
    expect(w.jellies).toHaveLength(0);
    expect(w.snapshotFor(0).jl).toBeUndefined();
  });

  it('a jelly-rain round sends its jellies, with the lunge flag', () => {
    const w = new World();
    w.setWeather('jelly-rain');
    const jl = w.snapshotFor(0).jl ?? [];
    expect(jl).toHaveLength(JELLY_COUNT);
    expect(jl.every((j) => typeof j.d === 'boolean')).toBe(true);
  });

  it('stings a fighter the jelly touches, once per cooldown', () => {
    const w = new World();
    w.setWeather('jelly-rain');
    const a = w.addPlayer(1, 'A', 'default');
    a.shield = 0; // a fresh spawn is shielded for 1.5 s, which would absorb the stings
    const hp0 = a.hp;
    const j = w.jellies[0];
    j.t = 2; // drifting, so it does not run off during the test
    // hold the fighter on the jelly for half a second: one sting, then the cooldown holds
    for (let i = 0; i < TICK_HZ / 2; i++) {
      a.x = j.x;
      a.y = j.y;
      w.step();
    }
    expect(a.hp).toBe(hp0 - JELLY_STING);
    // after the cooldown the same jelly stings again
    for (let i = 0; i < Math.ceil((JELLY_STING_CD + 0.1) * TICK_HZ); i++) {
      a.x = j.x;
      a.y = j.y;
      w.step();
    }
    expect(a.hp).toBe(hp0 - 2 * JELLY_STING);
  });

  it('a fighter clear of every jelly takes no damage', () => {
    const w = new World();
    w.setWeather('jelly-rain');
    const a = w.addPlayer(1, 'A', 'default');
    a.x = 10;
    a.y = 10;
    const hp0 = a.hp;
    for (let i = 0; i < TICK_HZ; i++) w.step();
    expect(a.hp).toBe(hp0);
  });
});
