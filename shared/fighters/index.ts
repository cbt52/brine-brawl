import { BRAK } from './brak.ts';
import { DEFAULT_FIGHTER } from './default.ts';
import { EMBERCUB } from './embercub.ts';
import { MIRA } from './mira.ts';
import { MOSSBACK } from './mossback.ts';
import { NOODLE } from './noodle.ts';
import { PIP } from './pip.ts';
import { SUDSY } from './sudsy.ts';
import { VOLTBUN } from './voltbun.ts';
import type { FighterDef } from './types.ts';

const DEFS: FighterDef[] = [DEFAULT_FIGHTER, VOLTBUN, EMBERCUB, MOSSBACK, MIRA, PIP, BRAK, NOODLE, SUDSY];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

export { BRAK } from './brak.ts';
export { DEFAULT_FIGHTER } from './default.ts';
export { EMBERCUB } from './embercub.ts';
export { MIRA } from './mira.ts';
export { MOSSBACK } from './mossback.ts';
export { NOODLE } from './noodle.ts';
export { PIP } from './pip.ts';
export { SUDSY } from './sudsy.ts';
export { VOLTBUN } from './voltbun.ts';

export const DEFAULT_FIGHTER_ID = DEFAULT_FIGHTER.id;

/** Every registered fighter (bots, balance harness, gallery). */
export const FIGHTERS: readonly FighterDef[] = DEFS;

/** The real kits, in roster order — the character select grid iterates this (Deckhand is the fallback). */
export const SELECTABLE: readonly FighterDef[] = DEFS.filter((d) => d.id !== DEFAULT_FIGHTER_ID);

export function getFighter(id: string | undefined | null): FighterDef {
  return (id && BY_ID.get(id)) || DEFAULT_FIGHTER;
}

/** Join payload → a registered id (unknown or hostile ids fall back to `default`). */
export function resolveFighterId(raw: unknown): string {
  return typeof raw === 'string' && BY_ID.has(raw) ? raw : DEFAULT_FIGHTER_ID;
}

/** Random registered id — bots use this so they show up with real kits. */
export function randomFighterId(): string {
  return DEFS[Math.floor(Math.random() * DEFS.length)].id;
}
