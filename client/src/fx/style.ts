import type { Element } from '../../../shared/fighters/types.ts';

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

export function elementColor(e: Element | undefined): number {
  return ELEMENT_COLOR[e ?? 'neutral'] ?? ELEMENT_COLOR.neutral;
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
