/**
 * Jellyfish rain (backlog #30): a see-through violet bell that pulses, with four tentacles that sway.
 * A lunging jelly gets a pink warning ring. Drawn over the sand, under the fighters, from the
 * snapshot's jellies only, so nothing here decides a sting.
 */
import type Phaser from 'phaser';
import type { SnapJelly } from '../../../shared/protocol.ts';

const BELL = 0xc89bff;
const EDGE = 0xf2e6ff;
const WARN = 0xff7ad9;

export function drawJelly(g: Phaser.GameObjects.Graphics, j: SnapJelly, nowMs: number): void {
  const pulse = Math.sin(nowMs / 260 + j.id * 1.7);
  const bell = j.r * (1 + 0.05 * pulse);
  if (j.d) g.lineStyle(4, WARN, 0.6).strokeCircle(j.x, j.y, j.r + 12);
  g.lineStyle(3, BELL, 0.8);
  for (let k = 0; k < 4; k++) {
    const tx = j.x + (k - 1.5) * j.r * 0.5;
    const sway = Math.sin(nowMs / 200 + k + j.id) * 6;
    g.lineBetween(tx, j.y, tx + sway, j.y + j.r * 0.9);
  }
  g.fillStyle(BELL, 0.55).fillEllipse(j.x, j.y, bell * 2, bell * 1.5);
  g.lineStyle(3, EDGE, 0.9).strokeEllipse(j.x, j.y, bell * 2, bell * 1.5);
  g.fillStyle(0xffffff, 0.6).fillEllipse(j.x - bell * 0.35, j.y - bell * 0.3, bell * 0.5, bell * 0.3);
}
