import { SKINS, recolorSvg } from '../../../shared/skins.ts';
import { artUrl } from './manifest.ts';

/**
 * Skinned portraits for the DOM (backlog #16). The select cards and the WANTED posters draw plain
 * `<img>` or canvas art, so they cannot use the Phaser texture keys from `skinArt.ts`. This fetches the
 * fighter SVG once, recolours it with the same `recolorSvg` maths and hands out a blob URL.
 */
const urls = new Map<string, Promise<string>>();

/** Portrait URL for a fighter in one skin; skin 0 is the file itself and needs no fetch. */
export function skinnedPortrait(id: string, skin: number): Promise<string> {
  if (!skin || !SKINS[skin]) return Promise.resolve(artUrl(id));
  const key = `${id}:${skin}`;
  let url = urls.get(key);
  if (!url) {
    url = fetch(artUrl(id))
      .then((r) => r.text())
      .then((svg) => URL.createObjectURL(new Blob([recolorSvg(svg, SKINS[skin].hueShift)], { type: 'image/svg+xml' })))
      .catch(() => {
        // a failed fetch falls back to the drawn look and is retried on the next call
        urls.delete(key);
        return artUrl(id);
      });
    urls.set(key, url);
  }
  return url;
}
