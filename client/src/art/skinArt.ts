import type Phaser from 'phaser';
import { SKINS, recolorSvg } from '../../../shared/skins.ts';
import { ART, artKey, artUrl, hurtKey, hurtUrl } from './manifest.ts';

/**
 * Palette-swap textures (backlog #3, slice 2). Skin 0 is the drawn look and keeps the old keys; skin
 * n > 0 is `<art key>-s<n>`, built at runtime from the fighter SVG text with `recolorSvg`.
 */

/** Texture key for a body (`hurt` false) or hurt face in one skin. */
export function skinKey(id: string, skin: number, hurt = false): string {
  const base = hurt ? hurtKey(id) : artKey(id);
  return skin ? `${base}-s${skin}` : base;
}

/** The skinned texture once it exists, otherwise the drawn look (builds are async). */
export function pickSkinKey(textures: { exists(key: string): boolean }, id: string, skin: number, hurt = false): string {
  const key = skinKey(id, skin, hurt);
  return textures.exists(key) ? key : skinKey(id, 0, hurt);
}

const srcKey = (id: string, hurt: boolean): string => `svgsrc-${id}${hurt ? '-hurt' : ''}`;
/** Skin keys already handed to the texture manager, so a second preload never queues them twice. */
const queued = new Set<string>();

/** Queue the SVG text of every fighter (body and hurt face) so the skin copies can be made from it. */
export function queueSkinSources(scene: Phaser.Scene): void {
  for (const a of ART) {
    scene.load.text(srcKey(a.id, false), artUrl(a.id));
    scene.load.text(srcKey(a.id, true), hurtUrl(a.id));
  }
}

/**
 * Call once the preload is complete: one texture per extra skin for every body and hurt face. Each
 * copy lands a frame later (`addtexture`), so sprites fall back to the drawn look until then.
 */
export function buildSkinTextures(scene: Phaser.Scene): void {
  for (const a of ART) {
    for (const hurt of [false, true]) {
      const src = scene.cache.text.get(srcKey(a.id, hurt)) as string | undefined;
      if (!src) continue;
      for (let skin = 1; skin < SKINS.length; skin++) {
        const key = skinKey(a.id, skin, hurt);
        if (queued.has(key)) continue;
        queued.add(key);
        const svg = recolorSvg(src, SKINS[skin].hueShift);
        scene.textures.addBase64(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      }
    }
  }
}
