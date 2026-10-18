import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { BUSHES, DECOR, OBSTACLES, SHALLOWS } from '../../../shared/arena/docks.ts';

const DEEP = 0x0e3a4e;
const SAND = 0xe9d6a6;
const SAND_DARK = 0xc9b78a;
const CORAL = 0xff8f7a;
const CORAL_DARK = 0xc45d51;
const SHALLOW = 0x2f9ab0;

/**
 * Static arena background, painted ONCE into a RenderTexture (cheap on phones) plus a thin
 * animated wave layer on top. Visual only — collision lives in `shared/arena/docks.ts`.
 */
export class ArenaArt {
  private waves: Phaser.GameObjects.Graphics;
  private lowfx: boolean;

  constructor(scene: Phaser.Scene, opts: { lowfx?: boolean } = {}) {
    this.lowfx = Boolean(opts.lowfx);
    const rt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0);
    const g = scene.make.graphics({}, false);
    this.paint(g);
    rt.draw(g);
    g.destroy();
    this.paintBushes(scene);
    this.waves = scene.add.graphics().setDepth(2);
  }

  /** lagoon, sand island, pier planks, shallows, coral walls, props, vignette */
  private paint(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(DEEP, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    // deep-water bands give the lagoon some depth without a texture
    g.fillStyle(0x124a62, 0.75).fillRect(0, 0, WORLD_W, 240).fillRect(0, WORLD_H - 300, WORLD_W, 300);

    // sand island with a wet rim
    g.fillStyle(SAND_DARK, 1).fillRoundedRect(18, 18, WORLD_W - 36, WORLD_H - 36, 190);
    g.fillStyle(SAND, 1).fillRoundedRect(40, 40, WORLD_W - 80, WORLD_H - 80, 170);
    g.lineStyle(5, 0xfff0c9, 0.5).strokeRoundedRect(46, 46, WORLD_W - 92, WORLD_H - 92, 166);

    // pier planks: long boards with darker seams, plus a few cross seams
    g.lineStyle(2, 0xb08d5f, 0.35);
    for (let y = 70; y < WORLD_H - 60; y += 84) g.lineBetween(46, y, WORLD_W - 46, y);
    g.lineStyle(2, 0xb08d5f, 0.18);
    for (let y = 70; y < WORLD_H - 60; y += 84) {
      const off = y % 168 === 70 ? 300 : 520;
      for (let x = 46 + off; x < WORLD_W - 46; x += 620) g.lineBetween(x, y, x, y + 84);
    }

    // shallow lagoon pockets (T18 turns these into the tide)
    for (const s of SHALLOWS) {
      g.fillStyle(SHALLOW, 0.9).fillRoundedRect(s.x, s.y, s.w, s.h, 70);
      g.lineStyle(4, 0xdff7ff, 0.55).strokeRoundedRect(s.x, s.y, s.w, s.h, 70);
    }

    // coral walls, exactly on the collision rects
    for (const o of OBSTACLES) {
      g.fillStyle(CORAL_DARK, 1).fillRoundedRect(o.x + 4, o.y + 6, o.w, o.h, 18);
      g.fillStyle(CORAL, 1).fillRoundedRect(o.x, o.y, o.w, o.h, 18);
      g.lineStyle(4, 0x8e3f36, 1).strokeRoundedRect(o.x, o.y, o.w, o.h, 18);
      g.fillStyle(0xffc3b0, 0.55).fillRoundedRect(o.x + 8, o.y + 8, Math.max(10, o.w - 16), Math.max(8, o.h * 0.18), 8);
      // coral nubs along the top edge
      for (let x = o.x + 16; x < o.x + o.w - 10; x += 34) {
        g.fillStyle(CORAL_DARK, 1).fillCircle(x, o.y, 7);
        g.fillStyle(CORAL, 1).fillCircle(x, o.y - 2, 5);
      }
    }

    // barrels and crates
    for (const d of DECOR) {
      if (d.w > d.h) {
        g.fillStyle(0x8a5a34, 1).fillRoundedRect(d.x, d.y, d.w, d.h, 8);
        g.lineStyle(3, 0x5d3b22, 1).strokeRoundedRect(d.x, d.y, d.w, d.h, 8);
        g.lineBetween(d.x + 6, d.y + 6, d.x + d.w - 6, d.y + d.h - 6);
        g.lineBetween(d.x + d.w - 6, d.y + 6, d.x + 6, d.y + d.h - 6);
      } else {
        const cx = d.x + d.w / 2;
        const cy = d.y + d.h / 2;
        g.fillStyle(0x9b6b3e, 1).fillCircle(cx, cy, d.w / 2);
        g.lineStyle(3, 0x5d3b22, 1).strokeCircle(cx, cy, d.w / 2);
        g.lineStyle(3, 0x6f4a2a, 0.9).strokeCircle(cx, cy, d.w / 2 - 8);
        g.lineBetween(cx - d.w / 2 + 3, cy, cx + d.w / 2 - 3, cy);
      }
    }

    // edge vignette
    for (let i = 0; i < 6; i++) {
      const a = 0.06 + i * 0.025;
      const t = 14 + i * 12;
      g.fillStyle(0x04141c, a);
      g.fillRect(0, 0, WORLD_W, t);
      g.fillRect(0, WORLD_H - t, WORLD_W, t);
      g.fillRect(0, 0, t, WORLD_H);
      g.fillRect(WORLD_W - t, 0, t, WORLD_H);
    }
    g.lineStyle(8, 0x0b2a38, 1).strokeRect(0, 0, WORLD_W, WORLD_H);
  }

  /** kelp patches sit above the rigs so a hidden fighter is genuinely obscured */
  private paintBushes(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setDepth(26);
    for (const b of BUSHES) {
      g.fillStyle(0x0f5c46, 0.55).fillRoundedRect(b.x, b.y, b.w, b.h, 46);
      g.fillStyle(0x1c8a63, 0.85).fillRoundedRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12, 40);
      // kelp leaves
      for (let i = 0; i < 7; i++) {
        const lx = b.x + 18 + ((i * 61) % Math.max(24, b.w - 36));
        const ly = b.y + 16 + ((i * 37) % Math.max(20, b.h - 34));
        const sway = i % 2 === 0 ? 16 : -14;
        g.lineStyle(9, i % 3 === 0 ? 0x2fae7c : 0x177a55, 0.95);
        g.beginPath();
        g.moveTo(lx, ly + 18);
        g.lineTo(lx + sway * 0.4, ly + 4);
        g.lineTo(lx + sway, ly - 12);
        g.strokePath();
      }
      g.lineStyle(4, 0x0b4a37, 0.9).strokeRoundedRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12, 40);
    }
  }

  /** gentle wave lines around the shore: recomputed on the wave layer only */
  updateWaves(nowMs: number): void {
    const g = this.waves;
    g.clear();
    const t = nowMs / 900;
    g.lineStyle(2, 0xdff7ff, 0.35);
    // shore surf: short arcs along the island rim
    for (let i = 0; i < 26; i++) {
      const x = 120 + ((i * 197) % (WORLD_W - 240));
      const bob = Math.sin(t + i) * 5;
      const top = i % 2 === 0;
      const y = (top ? 26 : WORLD_H - 26) + bob;
      g.beginPath();
      g.arc(x, y, 26, top ? 0.15 : Math.PI + 0.15, top ? Math.PI - 0.15 : Math.PI * 2 - 0.15);
      g.strokePath();
    }
    if (this.lowfx) return;
    // open-water ripples
    g.lineStyle(2, 0x9fe7ff, 0.18);
    for (let i = 0; i < 14; i++) {
      const x = 90 + ((i * 311) % (WORLD_W - 180));
      const y = 90 + ((i * 173) % (WORLD_H - 180));
      const w = 30 + Math.sin(t * 1.3 + i) * 10;
      g.lineBetween(x, y + Math.cos(t + i) * 3, x + w, y + Math.cos(t + i) * 3);
    }
    for (const s of SHALLOWS) {
      g.lineStyle(3, 0xdff7ff, 0.3);
      for (let i = 0; i < 4; i++) {
        const y = s.y + 40 + i * (s.h / 5) + Math.sin(t * 1.5 + i) * 6;
        g.lineBetween(s.x + 30, y, s.x + s.w - 30, y);
      }
    }
  }
}
