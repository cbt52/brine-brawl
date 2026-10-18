/**
 * Pure sound mapping: snapshot events → synth preset names, element → preset, distance → gain.
 * No WebAudio here, so the mapping is unit-testable in Node (T15).
 */
import type { SimEvent, SnapVolley } from '../../../shared/protocol.ts';
import type { Element } from '../../../shared/fighters/types.ts';

export type SfxName =
  | 'shoot'
  | 'zap'
  | 'splash'
  | 'bonk'
  | 'whip'
  | 'pop'
  | 'ko'
  | 'ult'
  | 'pickup'
  | 'countdown'
  | 'horn'
  | 'react'
  | 'bubble'
  | 'cannon'
  | 'cannonWarn'
  | 'cannonFire';

/** A hit louder than this gets the heavy "bonk" instead of the element sound. */
export const HEAVY_HIT = 25;

/** Distance (world units) where a sound has faded out completely. */
export const SFX_MAX_DIST = 900;

export interface SoundCue {
  name: SfxName;
  /** world position when the event carries one (used for distance + panning) */
  x?: number;
  y?: number;
}

const ELEMENT_SFX: Record<Element, SfxName> = {
  neutral: 'shoot',
  water: 'splash',
  fire: 'bonk',
  volt: 'zap',
  earth: 'bonk',
  leaf: 'whip',
  air: 'pop',
};

/** Which preset a fighter's element shoots with. */
export function elementSfx(element: Element | undefined): SfxName {
  return ELEMENT_SFX[element ?? 'neutral'] ?? 'shoot';
}

/** Quadratic roll-off so distant fights stay background noise. 0 dB at the source, silent past `max`. */
export function attenuation(dist: number, max: number = SFX_MAX_DIST): number {
  if (!Number.isFinite(dist) || dist <= 0) return dist === 0 ? 1 : 1;
  if (dist >= max) return 0;
  const near = 1 - dist / max;
  return near * near;
}

/**
 * Cue for one snapshot event. `elementOf` resolves a player id to its element (the client knows
 * the fighters, the sim events only carry ids).
 */
export function cueForEvent(
  e: SimEvent,
  elementOf: (id: number) => Element = () => 'neutral',
): SoundCue | null {
  switch (e.k) {
    case 'shot':
      return { name: elementSfx(elementOf(e.id)), x: e.x, y: e.y };
    case 'hit':
      // a cannon bar (backlog #39) has no fighter behind it: its own deep thud, not the heavy bonk
      if (e.src === 'cannon') return { name: 'cannon', x: e.x, y: e.y };
      return { name: e.dmg >= HEAVY_HIT ? 'bonk' : elementSfx(elementOf(e.a)), x: e.x, y: e.y };
    case 'ko':
      return { name: 'ko' };
    case 'cast':
      return e.slot === 'ult'
        ? { name: 'ult', x: e.x, y: e.y }
        : { name: elementSfx(elementOf(e.id)), x: e.x, y: e.y };
    case 'status':
      return e.s === 'trapped' ? { name: 'pop' } : null;
    case 'react':
      return { name: 'react', x: e.x, y: e.y };
    case 'purrl':
      // Purrl's patch-up (backlog #38): a soft bubble chime, quiet so it never drowns out a hit
      return { name: 'bubble', x: e.x, y: e.y };
    case 'chest':
      // a chest popping open: the reward chime, not another hit thud
      return { name: 'pickup', x: e.x, y: e.y };
    case 'wall':
      // a stone wall crumbling: a low thud
      return { name: 'bonk', x: e.x, y: e.y };
    case 'pick':
      return { name: 'pickup', x: e.x, y: e.y };
    case 'combo':
      // Crew Combo (T28): the ult fanfare at the contact point
      return { name: 'ult', x: e.x, y: e.y };
    case 'passive':
      // faction passive stingers (T20): EVOLVE gets the fanfare, TOON LOGIC the boing
      return { name: e.p === 'evolve' ? 'ult' : e.p === 'flow' ? 'whip' : e.p === 'plunder' ? 'pickup' : 'pop', x: e.x, y: e.y };
    case 'spawn':
      return null;
    default:
      return null;
  }
}

/** A lane's volley stage (backlog #44): what the last snapshot showed on it. */
export type VolleyStage = SnapVolley['st'];

/**
 * Cannon volley cues (backlog #44): a warning blip when a lane first shows its telegraph, a
 * thud when that telegraph turns into the moving bar. `prev` is the stage per lane from the
 * last call and `next` replaces it, so a lane that goes idle re-arms for its next volley. A
 * bar already in flight when first seen (joined mid-volley) plays nothing. Idempotent for the
 * same snapshot, so it can run every frame.
 */
export function volleyCues(
  prev: ReadonlyMap<number, VolleyStage>,
  vols: readonly SnapVolley[],
  cannons: readonly { x: number; y: number }[],
): { cues: SoundCue[]; next: Map<number, VolleyStage> } {
  const cues: SoundCue[] = [];
  const next = new Map<number, VolleyStage>();
  for (const v of vols) {
    const c = cannons[v.i];
    if (!c) continue;
    const was = prev.get(v.i);
    next.set(v.i, v.st);
    if (v.st === 'warn' && was !== 'warn') cues.push({ name: 'cannonWarn', x: c.x, y: c.y });
    else if (v.st === 'fire' && was === 'warn') cues.push({ name: 'cannonFire', x: c.x, y: c.y });
  }
  return { cues, next };
}
