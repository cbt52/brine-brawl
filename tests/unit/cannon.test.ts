import { describe, it, expect } from 'vitest';
import {
  CANNON_WARN_SEC, SHOT_SPEED, SHOT_WIDTH, type Cannon, shotLife, volleyAt, volleyHits,
} from '../../shared/sim/cannon.ts';

const gun: Cannon = { x: 100, y: 800, a: 0, period: 4, phase: 2, range: 1200 };
const R = 22;

describe('lane cannon: telegraph, travel and hit (backlog #1 slice 1)', () => {
  it('idles before its phase, then telegraphs for CANNON_WARN_SEC before the bar leaves the muzzle', () => {
    expect(volleyAt(gun, 1.9)).toBeNull();
    expect(volleyAt(gun, 2.5)).toMatchObject({ k: 0, stage: 'warn' });
    expect(volleyAt(gun, 2 + CANNON_WARN_SEC + 0.01)).toMatchObject({ k: 0, stage: 'fire' });
  });

  it('goes idle once the bar has cleared the lane, and fires volley k+1 on its period', () => {
    const cleared = 2 + CANNON_WARN_SEC + shotLife(gun.range) + 0.05;
    expect(volleyAt(gun, cleared)).toBeNull();
    expect(volleyAt(gun, 2 + gun.period + 0.5)).toMatchObject({ k: 1, stage: 'warn' });
  });

  it('the period always leaves room: one volley is fully over before the next telegraph starts', () => {
    expect(gun.period).toBeGreaterThan(CANNON_WARN_SEC + shotLife(gun.range));
  });

  it('the bar hits a body in its lane once it reaches it, and not before', () => {
    const fireAt = (age: number) => volleyAt(gun, 2 + CANNON_WARN_SEC + age)!;
    const reach = (gun.x + 400 - gun.x) / SHOT_SPEED; // head at x+400
    expect(volleyHits(gun, fireAt(0.1), gun.x + 400, gun.y, R)).toBe(false);
    expect(volleyHits(gun, fireAt(reach), gun.x + 400, gun.y, R)).toBe(true);
  });

  it('misses bodies beside the lane, behind the muzzle, and beyond the range', () => {
    const v = volleyAt(gun, 2 + CANNON_WARN_SEC + 400 / SHOT_SPEED)!;
    const edge = SHOT_WIDTH / 2 + R;
    expect(volleyHits(gun, v, gun.x + 400, gun.y + edge + 2, R)).toBe(false);
    expect(volleyHits(gun, v, gun.x + 400, gun.y + edge - 2, R)).toBe(true);
    expect(volleyHits(gun, v, gun.x - 200, gun.y, R)).toBe(false);
    expect(volleyHits(gun, v, gun.x + gun.range + R + 60, gun.y, R)).toBe(false);
  });

  it('the bar has passed a body once its tail clears it', () => {
    const v = volleyAt(gun, 2 + CANNON_WARN_SEC + 0.6)!;
    expect(volleyHits(gun, v, gun.x + 100, gun.y, R)).toBe(false);
  });

  it('a telegraph never hits, even standing dead centre in the lane', () => {
    const v = volleyAt(gun, 2.5)!;
    expect(v.stage).toBe('warn');
    expect(volleyHits(gun, v, gun.x + 50, gun.y, R)).toBe(false);
  });

  it('follows the aim angle: a cannon pointing down hits along +y, not +x', () => {
    const down: Cannon = { ...gun, a: Math.PI / 2 };
    const v = volleyAt(down, 2 + CANNON_WARN_SEC + 400 / SHOT_SPEED)!;
    expect(volleyHits(down, v, down.x, down.y + 400, R)).toBe(true);
    expect(volleyHits(down, v, down.x + 400, down.y, R)).toBe(false);
  });
});
