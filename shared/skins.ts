/**
 * Palette-swap skins (backlog #3, slice 1). Pure colour + string maths, no DOM, so the client can
 * build a recoloured SVG and the tests can check the real art files.
 *
 * A skin rotates the hue of every *saturated, mid-light* colour in a fighter SVG. The ink outline
 * (near-black), whites and greys stay as drawn, so faces and linework keep reading. Slice 1 is not
 * wired into the game yet: nothing sends or renders a skin until slice 2.
 */

export interface SkinDef {
  /** stable id (saved in localStorage, sent over the wire later) */
  id: string;
  name: string;
  /** hue rotation in degrees; 0 = the colours as drawn */
  hueShift: number;
}

/** Index 0 is always the drawn look; 1 and 2 are the two palette swaps each fighter gets. */
export const SKINS: readonly SkinDef[] = [
  { id: 'classic', name: 'Classic', hueShift: 0 },
  { id: 'dusk', name: 'Dusk', hueShift: 150 },
  { id: 'mint', name: 'Mint', hueShift: -110 },
];

/** Anything out of range (or not an integer) falls back to the drawn look. */
export function skinAt(index: number): SkinDef {
  return Number.isInteger(index) && SKINS[index] ? SKINS[index] : SKINS[0];
}

/** Below this saturation a colour is a grey and never rotates. */
const MIN_SAT = 0.2;
/** Lightness window: the ink outline (≈ 0.15) and the paper highlights (≈ 0.95) stay put. */
const MIN_LIGHT = 0.2;
const MAX_LIGHT = 0.92;

/** Only paint attributes with a six-digit colour; `url(#c11)` clip refs are not colours. */
const PAINT = /(fill|stroke|stop-color|flood-color)="#([0-9a-fA-F]{6})"/g;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
}

/** Rotate one `#rrggbb` colour's hue; neutral, too dark or too pale colours come back unchanged. */
export function shiftHex(hex: string, hueShift: number): string {
  if (hueShift % 360 === 0) return hex;
  const n = parseInt(hex.slice(1), 16);
  const [h, s, l] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  if (s < MIN_SAT || l < MIN_LIGHT || l > MAX_LIGHT) return hex;
  const [r, g, b] = hslToRgb((((h + hueShift) % 360) + 360) % 360, s, l);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Recolour every paint attribute of a fighter SVG; the structure (ids, clip refs, sizes) is untouched. */
export function recolorSvg(svg: string, hueShift: number): string {
  if (hueShift % 360 === 0) return svg;
  return svg.replace(PAINT, (_all, attr: string, hex: string) => `${attr}="${shiftHex('#' + hex, hueShift)}"`);
}
