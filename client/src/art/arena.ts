import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { DECOR, type Rect } from '../../../shared/arena/docks.ts';
import { type Arena, type ArenaId, DOCKS_ARENA } from '../../../shared/arena/arena.ts';
import { paintDeck } from './deckArt.ts';
import { debugRects, groundKey, rectsWanted } from './ground.ts';
import { ArenaProps, type PropLook } from './props.ts';
import { WaterArt, type WaterLook } from './water.ts';

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
  /** lagoon caustics + the rising-tide pools, redrawn every frame (depth 0.5–1.2: below the rigs) */
  private water: WaterArt;
  private lowfx: boolean;
  private arenaId?: ArenaId;
  /** `?rects=1` debug outlines (depth 40, above everything in the world) */
  private rects?: Phaser.GameObjects.Graphics;
  /** 3D-rendered walls, barrels/crates and kelp (T43); the painted ones when there is no atlas */
  private props: ArenaProps;

  constructor(scene: Phaser.Scene, opts: { lowfx?: boolean; rects?: boolean } = {}) {
    this.scene = scene;
    this.lowfx = Boolean(opts.lowfx);
    this.ground = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0);
    this.kelp = scene.add.graphics().setDepth(26);
    this.water = new WaterArt(scene);
    this.waves = scene.add.graphics().setDepth(2);
    if (opts.rects ?? rectsWanted()) this.rects = scene.add.graphics().setDepth(40);
    this.props = new ArenaProps(scene, this.lowfx);
    this.setArena(DOCKS_ARENA);
  }

  /** Paints the ground and kelp for `arena`; a no-op when that layout is already on screen. */
  setArena(arena: Arena): void {
    if (arena.id === this.arenaId) return;
    this.arenaId = arena.id;
    this.water.setArena(arena);
    const g = this.scene.make.graphics({}, false);
    this.ground.clear();
    const key = groundKey(arena.id);
    // walls, barrels/crates and kelp as y-sorted 3D sprites (T43) when the atlas is loaded
    const sprites = this.props.show(arena.id);
    if (arena.id === 'docks' && this.scene.textures.exists(key)) {
      // the Blender ground (T42) holds only the flat things
      const img = this.scene.make.image({ key }, false).setOrigin(0).setDisplaySize(WORLD_W, WORLD_H);
      this.ground.draw(img);
      img.destroy();
      if (!sprites) this.paintProps(g, arena);
    } else this.paint(g, arena, !sprites);
    this.ground.draw(g);
    g.destroy();
    this.kelp.clear();
    if (!sprites) this.paintBushes(arena.bushes);
    this.paintRects(arena);
  }

  /** Lagoon + flood state (debug hook `__brawl.water`, e2e). */
  get waterLook(): WaterLook {
    return this.water.look;
  }

  /** The placed prop sprites (debug hook `__brawl.props`, e2e). */
  get propLooks(): PropLook[] {
    return this.props.looks;
  }

  /** Outlines every gameplay rect (`?rects=1`) so art can be checked against collision. */
  private paintRects(arena: Arena): void {
    const g = this.rects;
    if (!g) return;
    g.clear();
    for (const { r, color } of debugRects(arena)) {
      g.fillStyle(color, 0.12).fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(2, color, 0.95).strokeRect(r.x, r.y, r.w, r.h);
    }
  }

  /** lagoon, sand island, pier planks, shallows, coral walls, props, vignette (the deck has its own) */
  private paint(g: Phaser.GameObjects.Graphics, arena: Arena, props: boolean): void {
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

    if (props) this.paintProps(g, arena);

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

  /** coral walls and barrels/crates, painted top-down (`?art=svg`; T43 renders them as 3D sprites) */
  private paintProps(g: Phaser.GameObjects.Graphics, arena: Arena): void {
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

  /**
   * Per frame: water (scrolling unless lowfx — `?lowfx=1` or the FX watchdog's `low`) and gentle
   * wave lines around the shore on the wave layer.
   */
  updateWaves(nowMs: number, low = false): void {
    const still = this.lowfx || low;
    this.water.update(nowMs, still);
    const g = this.waves;
    g.clear();
    const t = nowMs / 900;
    g.lineStyle(2, 0xdff7ff, 0.35);
    // shore surf: short arcs along the island rim
    for (let i = 0; i < 26; i++) {
      const x = 120 + ((i * 197) % (WORLD_W - 240));
      const bob = still ? 0 : Math.sin(t + i) * 5;
      const top = i % 2 === 0;
      const y = (top ? 26 : WORLD_H - 26) + bob;
      g.beginPath();
      g.arc(x, y, 26, top ? 0.15 : Math.PI + 0.15, top ? Math.PI - 0.15 : Math.PI * 2 - 0.15);
      g.strokePath();
    }
    // open-water ripples (the old look; the caustics tile replaces them, they also crossed the sand)
    if (still || this.water.look.lagoon) return;
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
    this.water.setTide(level);
  }
}
