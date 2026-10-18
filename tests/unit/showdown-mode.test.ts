import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import {
  SHOWDOWN_CENTER, SHOWDOWN_EDGE_DPS, SHOWDOWN_START_SEC, edgeHeading, safeRadius,
} from '../../shared/sim/showdown.ts';
import { sanitizeMode } from '../../server/rooms.ts';

const { x: cx, y: cy } = SHOWDOWN_CENTER;
/** deep in the corner: well outside even the full ring */
const CORNER = { x: 20, y: 20 };

/** A showdown world with one fighter at `at`, shield down, the round clock held at `t`. */
function arenaAt(at: { x: number; y: number }, t: number): World {
  const w = new World();
  w.setMode('showdown');
  w.addPlayer(1, 'Tester', 'default', false);
  const p = w.players.get(1)!;
  p.x = at.x;
  p.y = at.y;
  p.shield = 0;
  w.setRoundT(t);
  return w;
}

/** Run `sec` seconds of sim with the round clock held at `t` (the room feeds it per step). */
function runAt(w: World, sec: number, t: number): void {
  for (let i = 0; i < Math.round(sec * TICK_HZ); i++) {
    w.setRoundT(t);
    w.step();
  }
}

describe('edgeHeading', () => {
  it('is null while the ring has not started to close', () => {
    expect(edgeHeading(20, 20, SHOWDOWN_START_SEC)).toBeNull();
  });

  it('is null comfortably inside the ring', () => {
    expect(edgeHeading(cx, cy, 60)).toBeNull();
  });

  it('points back at the centre once the body is outside the ring', () => {
    const h = edgeHeading(20, 20, 60)!;
    // the heading from the corner is towards the centre: up-and-right in world coordinates
    expect(Math.cos(h)).toBeGreaterThan(0);
    expect(Math.sin(h)).toBeGreaterThan(0);
  });

  it('turns back inside the margin before the edge itself', () => {
    const t = 60;
    const edge = safeRadius(t);
    // just inside the ring edge but within the margin → still turns back
    expect(edgeHeading(cx + edge - 10, cy, t)).not.toBeNull();
  });
});

describe('Showdown in the world', () => {
  it('a body outside the ring loses edge damage in half-second chunks', () => {
    const w = arenaAt(CORNER, 60);
    runAt(w, 2, 60);
    const p = w.players.get(1)!;
    // two seconds outside ≈ SHOWDOWN_EDGE_DPS × 2 (chunk timing drifts by a tick, so allow a window)
    const lost = p.mhp - p.hp;
    expect(lost).toBeGreaterThanOrEqual(20);
    expect(lost).toBeLessThanOrEqual(SHOWDOWN_EDGE_DPS * 2 + 0.5);
    // one hit event per chunk, not one per sim tick
    expect(w.events.filter((e) => e.k === 'hit' && e.v === 1).length).toBeLessThanOrEqual(4);
  });

  it('a body inside the ring takes no edge damage', () => {
    const w = arenaAt({ x: cx, y: cy }, 60);
    runAt(w, 2, 60);
    expect(w.players.get(1)!.hp).toBe(w.players.get(1)!.mhp);
  });

  it('nothing happens before the ring starts to close', () => {
    const w = arenaAt(CORNER, SHOWDOWN_START_SEC);
    runAt(w, 2, SHOWDOWN_START_SEC);
    expect(w.players.get(1)!.hp).toBe(w.players.get(1)!.mhp);
  });

  it('outside showdown the ring does not hurt anybody', () => {
    const w = arenaAt(CORNER, 60);
    w.setMode('bounty');
    runAt(w, 2, 60);
    expect(w.players.get(1)!.hp).toBe(w.players.get(1)!.mhp);
  });

  it('the flood follows the ring, not the phase clock', () => {
    const w = arenaAt(CORNER, 0);
    runAt(w, 0.1, 0);
    expect(w.tide.level).toBe(0);
    runAt(w, 0.1, 150);
    expect(w.tide.level).toBe(1);
  });

  it('a bot outside the ring turns back towards the centre', () => {
    const w = arenaAt(CORNER, 60);
    const bot = new BotBrain(1, 'normal');
    const out = bot.think(w, 1 / TICK_HZ);
    expect(out.mx * (cx - CORNER.x) + out.my * (cy - CORNER.y)).toBeGreaterThan(0);
    expect(bot.state).toBe('ring');
  });
});

describe('room mode parsing', () => {
  it('accepts showdown alongside the existing modes', () => {
    expect(sanitizeMode('showdown')).toBe('showdown');
    expect(sanitizeMode('treasure')).toBe('treasure');
    expect(sanitizeMode('nope')).toBeNull();
  });
});
