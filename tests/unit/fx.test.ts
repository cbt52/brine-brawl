import { describe, expect, it } from 'vitest';
import { FxBudget, LOW_FPS_MS, PARTICLE_CAP, PARTICLE_CAP_LOW } from '../../client/src/fx/budget.ts';
import { CRIT_DMG, ELEMENT_COLOR, dmgStyle, elementColor } from '../../client/src/fx/style.ts';
import type { Element } from '../../shared/fighters/types.ts';

describe('FxBudget', () => {
  it('caps the number of live particles at the normal cap', () => {
    const b = new FxBudget();
    expect(b.cap).toBe(PARTICLE_CAP);
    expect(b.request(10)).toBe(10);
    expect(b.reserve(PARTICLE_CAP / 2)).toBe(true);
    expect(b.request(PARTICLE_CAP)).toBe(PARTICLE_CAP / 2);
    b.release(PARTICLE_CAP / 2);
    expect(b.reserve(PARTICLE_CAP)).toBe(true);
    expect(b.request(1)).toBe(0);
    expect(b.reserve(PARTICLE_CAP)).toBe(false);
  });

  it('caps harder once lowfx is on', () => {
    const b = new FxBudget(true);
    expect(b.low).toBe(true);
    expect(b.cap).toBe(PARTICLE_CAP_LOW);
    expect(b.request(PARTICLE_CAP)).toBe(PARTICLE_CAP_LOW);
  });

  it('releases slots back to the budget', () => {
    const b = new FxBudget();
    b.reserve(PARTICLE_CAP);
    expect(b.request(1)).toBe(0);
    b.release(3);
    expect(b.request(3)).toBe(3);
    expect(b.reserve(3)).toBe(true);
    expect(b.request(1)).toBe(0);
  });

  it('drops to lowfx only after 3 s below 45 fps', () => {
    const b = new FxBudget();
    // 2 s at 40 fps: not yet
    for (let t = 0; t < LOW_FPS_MS - 400; t += 33) b.sample(40, 33);
    expect(b.low).toBe(false);
    // recover for a frame resets the counter
    b.sample(60, 16);
    for (let t = 0; t < LOW_FPS_MS - 100; t += 33) b.sample(40, 33);
    expect(b.low).toBe(false);
    for (let t = 0; t < 600; t += 33) b.sample(40, 33);
    expect(b.low).toBe(true);
  });

  it('never drops on a solid 60 fps', () => {
    const b = new FxBudget();
    for (let i = 0; i < 600; i++) b.sample(60, 16);
    expect(b.low).toBe(false);
  });

  it('ignores the 0 fps report of a throttled tab', () => {
    const b = new FxBudget();
    for (let i = 0; i < 200; i++) b.sample(0, 5000);
    expect(b.low).toBe(false);
  });
});

describe('damage number style', () => {
  it('draws >25 damage bigger and red', () => {
    const normal = dmgStyle(CRIT_DMG);
    const crit = dmgStyle(CRIT_DMG + 1);
    expect(crit.size).toBeGreaterThan(normal.size);
    expect(crit.color).not.toBe(normal.color);
  });

  it('keeps small taps white', () => {
    expect(dmgStyle(9).color).toBe('#ffffff');
    expect(dmgStyle(9).size).toBe(26);
  });
});

describe('element colours', () => {
  const elements: Element[] = ['neutral', 'water', 'fire', 'volt', 'earth', 'leaf', 'air'];
  it('every element has a spark colour', () => {
    for (const e of elements) expect(ELEMENT_COLOR[e]).toBeTypeOf('number');
  });

  it('unknown/undefined falls back to neutral', () => {
    expect(elementColor(undefined)).toBe(ELEMENT_COLOR.neutral);
  });
});
