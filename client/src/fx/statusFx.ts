/**
 * Status + reaction presentation, pure so it runs in Node (unit tests): which icon a status shows,
 * its colour, and the small animation phases used for the wet drips and the burn flicker.
 * The drawing itself lives in GameScene.drawOverlays.
 */
import { ELEMENT_OF_STATUS, REACTION_BY_ID } from '../../../shared/sim/elements.ts';
import { hasStatus, type StatusKind } from '../../../shared/fighters/types.ts';
import { ELEMENT_COLOR } from './style.ts';

/** Above one head we show at most this many icons (old ones drop off on the right). */
export const MAX_STATUS_ICONS = 4;

/** Draw order: the nastiest status wins the leftmost slot. */
export const STATUS_ORDER: readonly StatusKind[] = ['trapped', 'stun', 'burn', 'static', 'wet', 'heavy', 'tangled'];

export type IconKind = 'bubble' | 'star' | 'flame' | 'bolt' | 'drop' | 'weight' | 'knot';

export const STATUS_ICON: Record<StatusKind, IconKind> = {
  trapped: 'bubble',
  stun: 'star',
  burn: 'flame',
  static: 'bolt',
  wet: 'drop',
  heavy: 'weight',
  tangled: 'knot',
};

/** Trapped and stunned have no element of their own, so they get hand-picked colours. */
const EXTRA_COLOR: Partial<Record<StatusKind, number>> = { trapped: 0x9fe7ff, stun: 0xfff3b0 };

/** Icon colour: the element that caused the status (water blue, volt yellow, ...). */
export function statusColor(status: StatusKind): number {
  const extra = EXTRA_COLOR[status];
  if (extra !== undefined) return extra;
  const el = ELEMENT_OF_STATUS[status];
  return el ? ELEMENT_COLOR[el] : ELEMENT_COLOR.neutral;
}

/** The statuses a snapshot mask carries, in priority order, capped at `MAX_STATUS_ICONS`. */
export function statusList(st: number | undefined): StatusKind[] {
  const out: StatusKind[] = [];
  for (const s of STATUS_ORDER) {
    if (!hasStatus(st, s)) continue;
    out.push(s);
    if (out.length >= MAX_STATUS_ICONS) break;
  }
  return out;
}

/** Icons for a snapshot status mask (same order/cap as `statusList`). */
export function statusIcons(st: number | undefined): IconKind[] {
  return statusList(st).map((s) => STATUS_ICON[s]);
}

/** Popup word for a reaction id (from the sim reaction table), null when unknown. */
export function reactionLabel(id: string): string | null {
  const r = (REACTION_BY_ID as Record<string, { word: string } | undefined>)[id];
  return r ? r.word : null;
}

/** Popup colour: the element that triggered the reaction. */
export function reactionColor(id: string): number {
  const r = (REACTION_BY_ID as Record<string, { element?: keyof typeof ELEMENT_COLOR } | undefined>)[id];
  return r?.element ? ELEMENT_COLOR[r.element] : ELEMENT_COLOR.neutral;
}

/** Falling-drip phase in 0..1 for wet bodies (`stagger` offsets the drops). */
export function dripPhase(tMs: number, stagger = 0): number {
  const p = (tMs / 700 + stagger) % 1;
  return p < 0 ? p + 1 : p;
}

/** Flicker alpha for a burning body: 0.55..1.0 at roughly 9 Hz. */
export function flameAlpha(tMs: number): number {
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((tMs / 1000) * Math.PI * 2 * 4.5));
}
