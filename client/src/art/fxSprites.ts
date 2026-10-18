import type Phaser from 'phaser';
import type { Element } from '../../../shared/fighters/types.ts';
import type { PickupKind } from '../../../shared/protocol.ts';
import { svgForced } from './sheets.ts';

/** The Blender FX atlas (`npm run art:fx`, T45): loot + pilot projectiles, every origin centred. */
export const FX_KEY = 'fx';
export const fxUrl = (ext: 'png' | 'json'): string => `/art/fx/fx.${ext}`;

export type FxFrame = 'chest' | 'coin' | 'heal' | 'ult' | 'bolt' | 'bubble' | 'drop' | 'fist';
export const FX_FRAMES: readonly FxFrame[] = ['chest', 'coin', 'heal', 'ult', 'bolt', 'bubble', 'drop', 'fist'];

export const pickupFrame = (k: PickupKind): FxFrame => (k === 'heal' ? 'heal' : k === 'gold' ? 'coin' : 'ult');

/**
 * Sprite for a projectile by its owner: Sudsy's bubbles, then by element (volt bolt, water
 * drop). Null = keep the plain painted ball.
 */
export function projFrame(fighter: string | undefined, element: Element | undefined): FxFrame | null {
  if (fighter === 'sudsy') return 'bubble';
  if (element === 'volt') return 'bolt';
  if (element === 'water') return 'drop';
  return null;
}

/** Display scale on top of 1/px; bolts and drops are fast and small in the sim. */
export const FX_SCALE: Partial<Record<FxFrame, number>> = { bolt: 0.7, drop: 0.8 };

/** Only these turn to their flight direction (they point +x in the atlas). */
export const fxTurns = (f: FxFrame): boolean => f === 'bolt' || f === 'drop' || f === 'fist';

/** Queue the FX atlas; `?art=svg` keeps the painted loot and balls (side-by-side comparisons). */
export function preloadFx(scene: Phaser.Scene, search?: string): void {
  if (svgForced(search)) return;
  scene.load.atlas(FX_KEY, fxUrl('png'), fxUrl('json'));
}

export interface FxLook {
  frame: FxFrame;
  x: number;
  y: number;
}

/**
 * A per-frame pool of atlas images: `begin()`, then `draw()` each sprite, then `end()` hides the
 * ones not used this frame. `ready` is false without the atlas (callers paint the old graphics).
 */
export class FxSprites {
  private pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private drawn: FxLook[] = [];
  readonly ready: boolean;
  private inv = 1;

  constructor(private scene: Phaser.Scene) {
    this.ready = scene.textures.exists(FX_KEY);
    if (this.ready) {
      const px = (scene.textures.get(FX_KEY).customData as { px?: number }).px;
      this.inv = 1 / (px || 1);
    }
  }

  begin(): void {
    this.used = 0;
    this.drawn = [];
  }

  draw(frame: FxFrame, x: number, y: number, depth: number, angleRad = 0, scale = 1): void {
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, FX_KEY, frame);
      this.pool.push(img);
    }
    this.used++;
    img
      .setFrame(frame)
      .setPosition(x, y)
      .setDepth(depth)
      .setRotation(fxTurns(frame) ? angleRad : 0)
      .setScale(this.inv * scale * (FX_SCALE[frame] ?? 1))
      .setVisible(true);
    this.drawn.push({ frame, x, y });
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }

  get looks(): FxLook[] {
    return this.drawn;
  }
}
