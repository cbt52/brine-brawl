import type { Element } from '../../../shared/fighters/types.ts';
import { colorblindEnabled } from '../ui/settings.ts';

/** Spark / impact colour per element (used by the FX pass; art keeps its own faction accent). */
export const ELEMENT_COLOR: Record<Element, number> = {
  neutral: 0xfff3b0,
  water: 0x63c7ff,
  fire: 0xff7a3d,
  volt: 0xffe14d,
  earth: 0xc89b6a,
  leaf: 0x7bd968,
  air: 0xd8f4ff,
};

/**
 * Colour-blind set (backlog #22): the Okabe-Ito hues plus a light/dark spread, so no two elements
 * differ only by red vs green. Same keys as `ELEMENT_COLOR`; the ☰ "Colour-blind" toggle picks it.
 */
export const ELEMENT_COLOR_CB: Record<Element, number> = {
  neutral: 0xffffff,
  water: 0x56b4e9,
  fire: 0xd55e00,
  volt: 0xf0e442,
  earth: 0xcc79a7,
  leaf: 0x009e73,
  air: 0x8d9bb3,
};

export function elementColor(e: Element | undefined): number {
  const pal = colorblindEnabled() ? ELEMENT_COLOR_CB : ELEMENT_COLOR;
  return pal[e ?? 'neutral'] ?? pal.neutral;
}

/** Damage above this is drawn bigger and red (a "crit-sized" pop). */
export const CRIT_DMG = 25;

export interface DmgStyle {
  /** font size in px */
  size: number;
  color: string;
  /** starting scale of the pop tween */
  pop: number;
}

export function dmgStyle(dmg: number): DmgStyle {
  return dmg > CRIT_DMG
    ? { size: 40, color: '#ff6b6b', pop: 1.6 }
    : { size: 26, color: '#ffffff', pop: 1.2 };
}
