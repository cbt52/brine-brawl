import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { DECOR, type Rect } from '../../../shared/arena/docks.ts';
import { type Arena, type ArenaId, DOCKS_ARENA } from '../../../shared/arena/arena.ts';
import { waterRects } from '../../../shared/sim/tide.ts';
import { paintDeck } from './deckArt.ts';

const DEEP = 0x0e3a4e;
const SAND = 0xe9d6a6;
const SAND_DARK = 0xc9b78a;
const CORAL = 0xff8f7a;
const CORAL_DARK = 0xc45d51;

/**
 * Static arena background, painted into a RenderTexture (cheap on phones) plus a thin animated
 * wave layer on top. `setArena` repaints it for the match's layout (backlog #26). Visual only —
 * collision lives in `shared/arena/`.
 */
export class ArenaArt {
  private scene: Phaser.Scene;
  private ground: Phaser.GameObjects.RenderTexture;
  private kelp: Phaser.GameObjects.Graphics;
  private waves: Phaser.GameObjects.Graphics;
  /** rising-tide water overlay, redrawn every frame (depth 1: above the ground, below the rigs) */
  private water: Phaser.GameObjects.Graphics;
  private lowfx: boolean;
  private tideLevel = 0;
  private arenaId?: ArenaId;
  /** the on-screen layout's flood pools (empty on the deck) */
  private pools: readonly Rect[] = [];

  constructor(scene: Phaser.Scene, opts: { lowfx?: boolean } = {}) {
    this.scene = scene;
    this.lowfx = Boolean(opts.lowfx);
    this.ground = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0);
    this.kelp = scene.add.graphics().setDepth(26);
    this.water = scene.add.graphics().setDepth(1);
    this.waves = scene.add.graphics().setDepth(2);
    this.setArena(DOCKS_ARENA);
  }

  /** Paints the ground and kelp for `arena`; a no-op when that layout is already on screen. */
  setArena(arena: Arena): void {
    if (arena.id === this.arenaId) return;
    this.arenaId = arena.id;
    this.pools = arena.shallows;
    const g = this.scene.make.graphics({}, false);
    this.paint(g, arena);
    this.ground.clear();
    this.ground.draw(g);
    g.destroy();
    this.kelp.clear();
    this.paintBushes(arena.bushes);
  }

  /** lagoon, sand island, pier planks, shallows, coral walls, props, vignette (the deck has its own) */
  private paint(g: Phaser.GameObjects.Graphics, arena: Arena): void {
    if (arena.id === 'galleon') {
      paintDeck(g, arena);
      return;
    }
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

    // tide-pool beds: the water itself is the animated overlay (setTide/updateWaves)
    for (const s of arena.shallows) {
      g.fillStyle(0x8fa88f, 0.55).fillRoundedRect(s.x, s.y, s.w, s.h, 70);
      g.lineStyle(4, 0xc0d8c8, 0.6).strokeRoundedRect(s.x, s.y, s.w, s.h, 70);
      g.fillStyle(0x7d967f, 0.5).fillEllipse(s.x + s.w / 2, s.y + s.h / 2, s.w * 0.62, s.h * 0.62);
    }

    // coral walls, exactly on the collision rects
    for (const o of arena.obstacles) {
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
  private paintBushes(bushes: readonly Rect[]): void {
    const g = this.kelp;
    for (const b of bushes) {
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
    this.paintTide(nowMs);
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
  }

  /** Flood level from the sim (0 = tide out, 1 = high tide). */
  setTide(level: number): void {
    this.tideLevel = Math.max(0, Math.min(1, level));
  }

  /** The flooded shallows: the pool grows with `tideLevel`, shrinks back as the tide runs out. */
  private paintTide(nowMs: number): void {
    const g = this.water;
    g.clear();
    const level = this.tideLevel;
    const rects = waterRects(level, this.pools);
    const t = nowMs / 700;
    for (const r of rects) {
      // the water is brighter and more opaque the higher the tide
      g.fillStyle(0x1c7f96, 0.55 + level * 0.3).fillRoundedRect(r.x, r.y, r.w, r.h, 24 + level * 40);
      g.lineStyle(3 + level * 2, 0xdff7ff, 0.35 + level * 0.4).strokeRoundedRect(r.x, r.y, r.w, r.h, 24 + level * 40);
      if (level < 0.2) continue;
      // surface ripples scale with the flooded area
      for (let i = 0; i < 3; i++) {
        const y = r.y + (r.h / 4) * (i + 1) + Math.sin(t + i * 1.3) * (4 + level * 4);
        g.lineStyle(2 + level * 2, 0xdff7ff, 0.18 + level * 0.22);
        g.lineBetween(r.x + 14, y, r.x + r.w - 14, y);
      }
      if (this.lowfx || level < 0.5) continue;
      // whitecaps at high tide
      for (let i = 0; i < 4; i++) {
        const x = r.x + 20 + ((i * 97 + Math.sin(t * 0.7 + i) * 20) % Math.max(30, r.w - 40));
        const y = r.y + 26 + (i * 61) % Math.max(24, r.h - 40);
        g.fillStyle(0xeafcff, 0.5).fillCircle(x, y, 3);
      }
    }
  }
}
