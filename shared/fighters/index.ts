import { ASHKA } from './ashka.ts';
import { BISQUE } from './bisque.ts';
import { BRAK } from './brak.ts';
import { DEFAULT_FIGHTER } from './default.ts';
import { DOZELUMP } from './dozelump.ts';
import { EMBERCUB } from './embercub.ts';
import { FAWNSWORTH } from './fawnsworth.ts';
import { GLOOMOTH } from './gloomoth.ts';
import { HAMMY } from './hammy.ts';
import { KIP } from './kip.ts';
import { KRILL } from './krill.ts';
import { LENNY } from './lenny.ts';
import { LUMPY } from './lumpy.ts';
import { MIRA } from './mira.ts';
import { MOSSBACK } from './mossback.ts';
import { NOODLE } from './noodle.ts';
import { NOVA } from './nova.ts';
import { PEBBLOR } from './pebblor.ts';
import { PINCHPENNY } from './pinchpenny.ts';
import { PIP } from './pip.ts';
import { SABLE } from './sable.ts';
import { SQUALL } from './squall.ts';
import { SUDSY } from './sudsy.ts';
import { TOBO } from './tobo.ts';
import { VOLTBUN } from './voltbun.ts';
import type { FighterDef } from './types.ts';

const DEFS: FighterDef[] = [
  DEFAULT_FIGHTER, VOLTBUN, EMBERCUB, MOSSBACK, GLOOMOTH, PEBBLOR, DOZELUMP,
  MIRA, PIP, BRAK, ASHKA, KIP, TOBO, NOODLE, SABLE, BISQUE, NOVA, LENNY, FAWNSWORTH,
  SUDSY, PINCHPENNY, HAMMY, LUMPY, SQUALL, KRILL,
];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

export { ASHKA } from './ashka.ts';
export { BISQUE } from './bisque.ts';
export { BRAK } from './brak.ts';
export { DEFAULT_FIGHTER } from './default.ts';
export { DOZELUMP } from './dozelump.ts';
export { EMBERCUB } from './embercub.ts';
export { FAWNSWORTH } from './fawnsworth.ts';
export { GLOOMOTH } from './gloomoth.ts';
export { HAMMY } from './hammy.ts';
export { KIP } from './kip.ts';
export { KRILL } from './krill.ts';
export { LENNY } from './lenny.ts';
export { LUMPY } from './lumpy.ts';
export { MIRA } from './mira.ts';
export { MOSSBACK } from './mossback.ts';
export { NOODLE } from './noodle.ts';
export { NOVA } from './nova.ts';
export { PEBBLOR } from './pebblor.ts';
export { PINCHPENNY } from './pinchpenny.ts';
export { PIP } from './pip.ts';
export { SABLE } from './sable.ts';
export { SQUALL } from './squall.ts';
export { SUDSY } from './sudsy.ts';
export { TOBO } from './tobo.ts';
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
