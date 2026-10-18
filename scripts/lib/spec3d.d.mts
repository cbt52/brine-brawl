export const PAL_KEYS: readonly string[];
export const PRIM_TYPES: readonly string[];
export const ANIM_STYLES: readonly string[];
export const FEATURE_FNS: Readonly<Record<string, readonly string[]>>;
export const FEATURE_COLOUR_KEYS: readonly string[];
export function specColours(spec: unknown): [string, string][];
export function validateSpec(spec: unknown): string[];
