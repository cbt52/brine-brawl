import Phaser from 'phaser';
import type { Arena } from '../../../shared/arena/arena.ts';
import type { Rect } from '../../../shared/arena/docks.ts';
import { waterRects } from '../../../shared/sim/tide.ts';
import { svgForced } from './sheets.ts';
import {
  bubbleSize, lagoonHoles, lagoonStrips, POOL, poolLook, rimPoints, tileOffset, WATER_IDS, WATER_TILE_SCALE,
  waterKey, waterScroll, waterUrl,
} from './waterMath.ts';

/** Queue the water tiles; `?art=svg` keeps the old flat water (side-by-side comparisons). */
export function preloadWater(scene: Phaser.Scene, search?: string): void {
  if (svgForced(search)) return;
  for (const id of WATER_IDS) scene.load.image(waterKey(id), waterUrl(id));
}

/** What `__brawl.water` reports (e2e + shots). */
export interface WaterLook {
  lagoon: boolean;
  pools: number;
  level: number;
  still: boolean;
}

/**
 * Lagoon caustics + flooded tide pools (T44). The lagoon is a scrolling caustics tile in 4 edge
 * strips, clipped by an inverted geometry mask (island + decks). The flood overlay is a toon pool
 * per `waterRects` rect: shallow fill with a darker core, caustics clipped to the water, a foam rim
 * of bubbles and expanding ripple rings. Everything stands still in lowfx.
 * Depths: lagoon 0.5 · pool fill 1 · pool caustics 1.1 · foam/ripples 1.2 (the wave layer is 2).
 */
export class WaterArt {
  private lagoon: Phaser.GameObjects.TileSprite[] = [];
  private lagoonMask?: Phaser.GameObjects.Graphics;
  private fill: Phaser.GameObjects.Graphics;
  private foam: Phaser.GameObjects.Graphics;
  private poolMask: Phaser.GameObjects.Graphics;
  private poolTiles: { pool: Rect; sprite: Phaser.GameObjects.TileSprite }[] = [];
  private pools: readonly Rect[] = [];
  private level = 0;
  private key?: string;
  private still = false;

  constructor(private scene: Phaser.Scene) {
    this.fill = scene.add.graphics().setDepth(1);
    this.foam = scene.add.graphics().setDepth(1.2);
    this.poolMask = scene.make.graphics({}, false);
  }

  /** True when the caustics tile can be drawn (loaded, and WebGL for the inverted mask). */
  private tileFor(arena: Arena): string | undefined {
    const key = waterKey(arena.id);
    const webgl = this.scene.sys.game.renderer.type === Phaser.WEBGL;
    return webgl && this.scene.textures.exists(key) ? key : undefined;
  }

  setArena(arena: Arena): void {
    for (const s of this.lagoon) s.destroy();
    for (const p of this.poolTiles) p.sprite.destroy();
    this.lagoon = [];
    this.poolTiles = [];
    this.lagoonMask?.destroy();
    this.lagoonMask = undefined;
    this.pools = arena.shallows;
    this.key = this.tileFor(arena);
    if (!this.key) return;
    const holes = lagoonHoles(arena);
    if (holes) {
      const g = this.scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1);
      for (const h of holes) g.fillRoundedRect(h.x, h.y, h.w, h.h, h.r);
      const mask = g.createGeometryMask().setInvertAlpha(true);
      this.lagoonMask = g;
      this.lagoon = lagoonStrips().map((r) => this.tile(r, 0.5).setAlpha(0.55).setMask(mask));
    }
    const poolMask = this.poolMask.createGeometryMask();
    this.poolTiles = this.pools.map((pool) => ({ pool, sprite: this.tile(pool, 1.1).setMask(poolMask) }));
  }

  private tile(r: Rect, depth: number): Phaser.GameObjects.TileSprite {
    return this.scene.add.tileSprite(r.x, r.y, r.w, r.h, this.key!).setOrigin(0).setDepth(depth)
      .setTileScale(WATER_TILE_SCALE);
  }

  /** Flood level from the sim (0 = tide out, 1 = high tide). */
  setTide(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
  }

  get look(): WaterLook {
    return { lagoon: this.lagoon.length > 0, pools: this.poolTiles.length, level: this.level, still: this.still };
  }

  update(nowMs: number, still: boolean): void {
    this.still = still;
    const scroll = waterScroll(nowMs, still);
    for (const s of this.lagoon) {
      const o = tileOffset(s.x, s.y, scroll);
      s.setTilePosition(o.x, o.y);
    }
    this.paintPools(nowMs, still, scroll);
  }

  private paintPools(nowMs: number, still: boolean, scroll: { x: number; y: number }): void {
    const { fill, foam, poolMask } = this;
    fill.clear();
    foam.clear();
    poolMask.clear().fillStyle(0xffffff, 1);
    const level = this.level;
    const rects = waterRects(level, this.pools);
    const t = still ? 0 : nowMs / 1000;
    let wet = false;
    rects.forEach((r, k) => {
      const look = poolLook(r, level);
      if (!look) return;
      wet = true;
      // toon fill: light shallows ring, darker core, a thin bright edge just inside the foam
      fill.fillStyle(POOL.shallow, look.alpha).fillRoundedRect(r.x, r.y, r.w, r.h, look.radius);
      const ci = look.coreInset;
      if (r.w > ci * 2 && r.h > ci * 2) {
        fill.fillStyle(POOL.core, look.alpha).fillRoundedRect(r.x + ci, r.y + ci, r.w - ci * 2, r.h - ci * 2,
          Math.max(8, look.radius - ci * 0.5));
      }
      fill.lineStyle(2, POOL.edge, 0.55).strokeRoundedRect(r.x + 7, r.y + 7, r.w - 14, r.h - 14, Math.max(4, look.radius - 7));
      poolMask.fillRoundedRect(r.x, r.y, r.w, r.h, look.radius);
      const tile = this.poolTiles[k];
      if (tile) {
        const o = tileOffset(tile.pool.x, tile.pool.y, { x: -scroll.x * 0.6, y: scroll.y * 0.6 });
        tile.sprite.setVisible(true).setAlpha(look.tile).setTilePosition(o.x, o.y);
      }
      // ripple rings: grow from the core out to the rim and fade (the water reads as slow/thick)
      if (!still) {
        for (let i = 0; i < 2; i++) {
          const p = (t / 2.6 + i / 2 + k * 0.31) % 1;
          const ins = (1 - p) * Math.min(r.w, r.h) * 0.38 + 10;
          if (r.w <= ins * 2 || r.h <= ins * 2) continue;
          foam.lineStyle(2 + level, POOL.edge, 0.5 * Math.sin(Math.PI * p))
            .strokeRoundedRect(r.x + ins, r.y + ins, r.w - ins * 2, r.h - ins * 2, Math.max(6, look.radius - ins * 0.5));
        }
      }
      // foam rim: a solid line plus a string of bubbles that bob along it
      foam.lineStyle(look.foam, POOL.foam, 0.85).strokeRoundedRect(r.x, r.y, r.w, r.h, look.radius);
      foam.fillStyle(POOL.foam, 0.9);
      rimPoints(r, look.radius).forEach((pt, i) => {
        const bob = still ? 0 : Math.sin(t * 2.2 + i * 1.7) * 1.6;
        foam.fillCircle(pt.x + bob, pt.y - bob * 0.6, bubbleSize(i) * (0.8 + level * 0.25));
      });
    });
    if (!wet) for (const p of this.poolTiles) p.sprite.setVisible(false);
  }
}
