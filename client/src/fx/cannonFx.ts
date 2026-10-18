/**
 * Deck cannon volleys (backlog #26): each lane shows its telegraph (a dashed line that brightens
 * and a muzzle that swells) and, once fired, the moving bar. Geometry comes from the shared cannon
 * module, so the bar is drawn exactly where the server hits. Drawn into the loot layer, under the
 * fighters.
 */
import type Phaser from 'phaser';
import { CANNON_WARN_SEC, SHOT_WIDTH, barSpan, type Cannon } from '../../../shared/sim/cannon.ts';
import type { SnapVolley } from '../../../shared/protocol.ts';

const WARN = 0xffd23f;
const BAR = 0xff6b3d;
const CORE = 0xffe9c2;
const OUTLINE = 0x1b1b2f;
/** dash pattern of the telegraph line: a dash, then a gap, in units along the lane */
const DASH = 30;
const GAP = 30;

/** A point on the lane `d` units from the muzzle, `w` units to the side of it (the same axes as volleyHits). */
function lanePt(c: Cannon, d: number, w: number): { x: number; y: number } {
  const cos = Math.cos(c.a);
  const sin = Math.sin(c.a);
  return { x: c.x + cos * d - sin * w, y: c.y + sin * d + cos * w };
}

export function drawVolleys(g: Phaser.GameObjects.Graphics, cannons: Cannon[], vols: SnapVolley[]): void {
  for (const sv of vols) {
    const c = cannons[sv.i];
    if (!c) continue;
    if (sv.st === 'warn') drawTelegraph(g, c, sv.age);
    else drawBar(g, c, sv.age);
  }
}

/** The lane as dashes that brighten as the shot nears, and a muzzle that swells until it fires. */
function drawTelegraph(g: Phaser.GameObjects.Graphics, c: Cannon, age: number): void {
  const k = Math.min(1, age / CANNON_WARN_SEC);
  g.lineStyle(4, WARN, 0.25 + 0.5 * k);
  for (let d = 0; d < c.range; d += DASH + GAP) {
    const a = lanePt(c, d, 0);
    const b = lanePt(c, Math.min(c.range, d + DASH), 0);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  g.fillStyle(WARN, 0.35 + 0.4 * k).fillCircle(c.x, c.y, 10 + 12 * k);
}

/** The moving bar: a slab across the lane with a bright core, drawn between its tail and head. */
function drawBar(g: Phaser.GameObjects.Graphics, c: Cannon, age: number): void {
  const span = barSpan(c, { stage: 'fire', age });
  if (!span) return;
  const half = SHOT_WIDTH / 2;
  const quad = [
    lanePt(c, span.tail, -half), lanePt(c, span.head, -half),
    lanePt(c, span.head, half), lanePt(c, span.tail, half),
  ];
  g.fillStyle(BAR, 1).fillPoints(quad, true);
  g.lineStyle(3, OUTLINE, 1).strokePoints(quad, true);
  // the core stripe only fits once the bar is long enough, so a fresh shot at the muzzle stays clean
  if (span.head - span.tail <= 16) return;
  const a = lanePt(c, span.tail + 8, 0);
  const b = lanePt(c, span.head - 8, 0);
  g.lineStyle(5, CORE, 0.85).lineBetween(a.x, a.y, b.x, b.y);
}
