import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { TIDE_CYCLE_SEC } from '../../shared/sim/tide.ts';
import { DOUBLE_TIDE_RATE, WEATHER_CHANCE, pickWeather, tideRate } from '../../shared/sim/weather.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const run = (w: World, sec: number) => { for (let i = 0; i < Math.round(sec * TICK_HZ); i++) w.step(); };

describe('weird weather roll', () => {
  it('a roll under the chance gets a modifier, the rest calm skies', () => {
    // the chance splits into three equal slices: Double Tide, bubble storm, jelly rain
    expect(pickWeather(0)).toBe('double-tide');
    expect(pickWeather(0.1)).toBe('double-tide');
    expect(pickWeather(0.2)).toBe('bubble-storm');
    expect(pickWeather(0.3)).toBe('bubble-storm');
    expect(pickWeather(0.4)).toBe('jelly-rain');
    expect(pickWeather(WEATHER_CHANCE - 0.001)).toBe('jelly-rain');
    expect(pickWeather(WEATHER_CHANCE)).toBe('clear');
    expect(pickWeather(0.999)).toBe('clear');
  });

  it('bad rolls fall back to calm skies', () => {
    expect(pickWeather(NaN)).toBe('clear');
    expect(pickWeather(-0.1)).toBe('clear');
    expect(pickWeather(1)).toBe('clear');
  });

  it('Showdown never rolls Double Tide, its flood follows the ring (backlog #20)', () => {
    expect(pickWeather(0, 'showdown')).toBe('bubble-storm');
    expect(pickWeather(0.2, 'showdown')).toBe('bubble-storm');
    expect(pickWeather(0.3, 'showdown')).toBe('jelly-rain');
    expect(pickWeather(WEATHER_CHANCE - 0.001, 'showdown')).toBe('jelly-rain');
    expect(pickWeather(WEATHER_CHANCE, 'showdown')).toBe('clear');
    expect(pickWeather(0, 'treasure')).toBe('double-tide');
  });

  it('only Double Tide speeds the tide clock up', () => {
    expect(tideRate('clear')).toBe(1);
    expect(tideRate('double-tide')).toBe(DOUBLE_TIDE_RATE);
  });
});

describe('weird weather in the sim', () => {
  it('a new world plays calm skies', () => {
    expect(new World().weather).toBe('clear');
  });

  it('Double Tide runs the tide clock twice as fast', () => {
    const calm = new World();
    const wild = new World();
    wild.setWeather('double-tide');
    // 18 s is past half of the 35 s low tide: the doubled clock has already turned the tide
    run(calm, 18);
    run(wild, 18);
    expect(calm.tide.phase).toBe('low');
    expect(wild.tide.phase).toBe('rising');
  });

  it('a double-tide round finishes a full cycle in half the time', () => {
    const w = new World();
    w.setWeather('double-tide');
    run(w, TIDE_CYCLE_SEC / 2 + 0.5);
    // 30.5 s of wall time is 61 s of tide time: one full 60 s cycle, then 1 s into the next low tide
    expect(w.tide.phase).toBe('low');
    expect(w.tide.elapsed).toBeCloseTo(1, 0);
  });

  it('calm skies leave the tide clock alone', () => {
    const w = new World();
    run(w, 10);
    expect(w.tide.elapsed).toBeCloseTo(10, 1);
  });
});
