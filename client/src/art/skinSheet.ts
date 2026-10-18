import type Phaser from 'phaser';
import { SKINS, recolorPixels } from '../../../shared/skins.ts';
import { ANIMS, SHEET_DIRS, animKey, frameName, sheetKey, type SheetAnim } from './sheets.ts';

/**
 * Skinned 3D atlases (T37). Skin 0 is the loaded atlas; skin n > 0 is a canvas copy recoloured with
 * `recolorPixels`, built the first time a fighter in that skin shows up (not at boot: most skins
 * never appear in a match). The frames are copied from the base atlas, trim data included.
 */

/**
 * Texture key for a fighter's sheet in one skin; builds the skinned copy on first use. Returns null
 * while the base atlas is missing (not loaded, or `?art=svg`).
 */
export function ensureSkinSheet(scene: Phaser.Scene, id: string, skin: number): string | null {
  const baseKey = sheetKey(id);
  const textures = scene.textures;
  if (!textures.exists(baseKey)) return null;
  const shift = SKINS[skin]?.hueShift ?? 0;
  if (!skin || shift % 360 === 0) return ensureAnims(scene, baseKey);
  const key = sheetKey(id, skin);
  if (textures.exists(key)) return ensureAnims(scene, key);

  const base = textures.get(baseKey);
  const img = base.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = textures.createCanvas(key, img.width, img.height);
  if (!canvas) return ensureAnims(scene, baseKey);
  const ctx = canvas.getContext();
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  recolorPixels(data.data, shift);
  ctx.putImageData(data, 0, 0);
  canvas.refresh();
  for (const name of base.getFrameNames()) {
    const f = base.get(name);
    const copy = canvas.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    if (copy && f.trimmed) copy.setTrim(f.realWidth, f.realHeight, f.x, f.y, f.cutWidth, f.cutHeight);
  }
  return ensureAnims(scene, key);
}

/** One Phaser animation per anim × rendered direction for a sheet texture (created once, global). */
function ensureAnims(scene: Phaser.Scene, texKey: string): string {
  const anims = scene.anims;
  for (const anim of Object.keys(ANIMS) as SheetAnim[]) {
    const def = ANIMS[anim];
    for (const dir of SHEET_DIRS) {
      const key = animKey(texKey, anim, dir);
      if (anims.exists(key)) continue;
      anims.create({
        key,
        frames: Array.from({ length: def.frames }, (_, i) => ({ key: texKey, frame: frameName(anim, dir, i) })),
        frameRate: def.fps,
        repeat: def.loop ? -1 : 0,
      });
    }
  }
  return texKey;
}
