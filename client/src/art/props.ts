import type Phaser from 'phaser';
import { WORLD_H } from '../../../shared/constants.ts';
import type { ArenaId } from '../../../shared/arena/arena.ts';
import { svgForced } from './sheets.ts';

/** Arenas with a Blender props atlas (`npm run art:arena -- <id> --props`, T43). */
export const PROPS_IDS: readonly ArenaId[] = ['docks'];

export const propsKey = (id: ArenaId): string => `props-${id}`;
export const propsUrl = (id: ArenaId, ext: 'png' | 'json'): string => `/art/arena/${id}-props.${ext}`;

/** kelp canopy sits above every rig (hiding spots stay hiding spots) */
export const KELP_DEPTH = 26;
const SWAY_DEG = 1.2;

/** Fighters and standing props share one y-sorted band (20–21): lower on screen draws in front. */
export const sortDepth = (y: number): number => 20 + y / WORLD_H;

export type PropKind = 'wall' | 'barrel' | 'crate' | 'kelp';

/** One placed prop from the atlas JSON (`props`): world anchor = its rect's bottom-edge middle. */
export interface PropInstance {
  frame: string;
  kind: PropKind;
  x: number;
  y: number;
  flip: boolean;
  ox: number;
  oy: number;
}

export const propDepth = (p: Pick<PropInstance, 'kind' | 'y'>): number => (p.kind === 'kelp' ? KELP_DEPTH : sortDepth(p.y));

/** Queue the props atlases; `?art=svg` keeps the painted props (side-by-side comparisons). */
export function preloadProps(scene: Phaser.Scene, search?: string): void {
  if (svgForced(search)) return;
  for (const id of PROPS_IDS) scene.load.atlas(propsKey(id), propsUrl(id, 'png'), propsUrl(id, 'json'));
}

/** What `__brawl.props` reports for each placed sprite. */
export interface PropLook {
  frame: string;
  kind: PropKind;
  x: number;
  y: number;
  depth: number;
}

/**
 * The 3D-rendered walls, barrels/crates and kelp of one arena as sprites (T43). Atlas px are
 * `px` per world unit, so each image is drawn at 1/px; kelp sways a little unless `lowfx`.
 */
export class ArenaProps {
  private images: Phaser.GameObjects.Image[] = [];
  private placed: PropLook[] = [];

  constructor(private scene: Phaser.Scene, private lowfx: boolean) {}

  /** Place the props of arena `id`; false (and nothing shown) when it has no loaded atlas. */
  show(id: ArenaId): boolean {
    this.clear();
    const key = propsKey(id);
    if (!PROPS_IDS.includes(id) || !this.scene.textures.exists(key)) return false;
    const data = this.scene.textures.get(key).customData as { px?: number; props?: PropInstance[] };
    if (!data.props?.length || !data.px) return false;
    data.props.forEach((p, i) => {
      const depth = propDepth(p);
      const img = this.scene.add
        .image(p.x, p.y, key, p.frame)
        .setOrigin(p.ox, p.oy)
        .setScale(1 / data.px!)
        .setFlipX(p.flip)
        .setDepth(depth);
      if (p.kind === 'kelp') {
        img.setAlpha(0.94);
        if (!this.lowfx) {
          img.setAngle(-SWAY_DEG);
          this.scene.tweens.add({
            targets: img, angle: SWAY_DEG, duration: 2600 + (i % 4) * 300, delay: (i * 370) % 1500,
            ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
          });
        }
      }
      this.images.push(img);
      this.placed.push({ frame: p.frame, kind: p.kind, x: p.x, y: p.y, depth });
    });
    return true;
  }

  clear(): void {
    for (const img of this.images) {
      this.scene.tweens.killTweensOf(img);
      img.destroy();
    }
    this.images = [];
    this.placed = [];
  }

  get looks(): PropLook[] {
    return this.placed;
  }
}
