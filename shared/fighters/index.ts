import { DEFAULT_FIGHTER } from './default.ts';
import type { FighterDef } from './types.ts';

const DEFS: FighterDef[] = [DEFAULT_FIGHTER];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

export { DEFAULT_FIGHTER } from './default.ts';

export const DEFAULT_FIGHTER_ID = DEFAULT_FIGHTER.id;

/** Every registered fighter (character select in T12 iterates this). */
export const FIGHTERS: readonly FighterDef[] = DEFS;

export function getFighter(id: string | undefined | null): FighterDef {
  return (id && BY_ID.get(id)) || DEFAULT_FIGHTER;
}

/** Join payload → a registered id (unknown or hostile ids fall back to `default`). */
export function resolveFighterId(raw: unknown): string {
  return typeof raw === 'string' && BY_ID.has(raw) ? raw : DEFAULT_FIGHTER_ID;
}
