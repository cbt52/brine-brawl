import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import type { Arena } from '../../../shared/arena/arena.ts';
import type { Rect } from '../../../shared/arena/docks.ts';

const SEA = 0x0e3a4e;
const HULL = 0x4a2e1c;
const DECK = 0xb9864f;
const SEAM = 0x7a4f2c;
const CRATE = 0x9b6b3e;
const IRON = 0x2b2f36;

/**
 * Taffy Galleon deck (backlog #26, art slice): open sea around a wooden deck with a hull rail,
 * the cannon carriages on their rails, and crates and masts where the arena's scenery stands.
 * Called from `ArenaArt` in place of the docks island; visual only, like the docks painter.
 */
export function paintDeck(g: Phaser.GameObjects.Graphics, arena: Arena): void {
  g.fillStyle(SEA, 1).fillRect(0, 0, WORLD_W, WORLD_H);
  // hull rail, then the planked deck inside it
  g.fillStyle(HULL, 1).fillRoundedRect(14, 14, WORLD_W - 28, WORLD_H - 28, 120);
  g.fillStyle(DECK, 1).fillRoundedRect(40, 40, WORLD_W - 80, WORLD_H - 80, 100);
  // deck boards run the length of the ship (left to right) with a seam every 64 units
  g.lineStyle(2, SEAM, 0.35);
  for (let x = 96; x < WORLD_W - 60; x += 64) g.lineBetween(x, 46, x, WORLD_H - 46);
  g.lineStyle(3, 0xe0b27a, 0.25).strokeRoundedRect(52, 52, WORLD_W - 104, WORLD_H - 104, 90);

  // the rails: a dark bulwark along the top and bottom of the deck
  g.lineStyle(8, HULL, 1);
  g.lineBetween(70, 58, WORLD_W - 70, 58);
  g.lineBetween(70, WORLD_H - 58, WORLD_W - 70, WORLD_H - 58);

  for (const o of arena.obstacles) paintCrate(g, o);
  for (const c of arena.cannons) paintCarriage(g, c.x, c.y, c.a);

  // a thin darker line on the outer hull, so the ship reads against the sea
  g.lineStyle(8, 0x0b2a38, 1).strokeRect(0, 0, WORLD_W, WORLD_H);
}

/** A crate (wide boards with an X brace) or, for a square post, a round mast. */
function paintCrate(g: Phaser.GameObjects.Graphics, o: Rect): void {
  if (o.w <= 60 && o.h <= 60) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    g.fillStyle(0x3a2516, 0.5).fillCircle(cx + 4, cy + 6, o.w / 2);
    g.fillStyle(0x8a5a34, 1).fillCircle(cx, cy, o.w / 2);
    g.lineStyle(4, 0x4a2e1c, 1).strokeCircle(cx, cy, o.w / 2);
    g.lineStyle(3, 0xc9a06a, 0.7).strokeCircle(cx, cy, o.w / 2 - 10);
    return;
  }
  g.fillStyle(0x3a2516, 0.5).fillRoundedRect(o.x + 4, o.y + 6, o.w, o.h, 10);
  g.fillStyle(CRATE, 1).fillRoundedRect(o.x, o.y, o.w, o.h, 10);
  g.lineStyle(3, 0x5d3b22, 1).strokeRoundedRect(o.x, o.y, o.w, o.h, 10);
  g.lineBetween(o.x + 6, o.y + 6, o.x + o.w - 6, o.y + o.h - 6);
  g.lineBetween(o.x + o.w - 6, o.y + 6, o.x + 6, o.y + o.h - 6);
}

/** A cannon on its carriage: a round wheel at the pivot and a barrel pointing along `a`. */
function paintCarriage(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number): void {
  const barrel = [[0, -14], [96, -10], [96, 10], [0, 14]] as const;
  g.fillStyle(IRON, 1).fillPoints(rotate(x, y, a, barrel), true);
  g.fillStyle(0x59606b, 1).fillCircle(x + Math.cos(a) * 96, y + Math.sin(a) * 96, 9);
  g.fillStyle(HULL, 1).fillCircle(x, y, 26);
  g.lineStyle(4, IRON, 1).strokeCircle(x, y, 26);
  g.fillStyle(IRON, 1).fillCircle(x, y, 7);
}

/** Local (x, y) offsets turned by `a` and moved to the pivot (x, y). */
function rotate(x: number, y: number, a: number, pts: readonly (readonly [number, number])[]): { x: number; y: number }[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([px, py]) => ({ x: x + px * c - py * s, y: y + px * s + py * c }));
}
