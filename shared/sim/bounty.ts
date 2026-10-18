/**
 * Bounty Brawl (T19): every fighter carries a doubloon bounty. A KO pays the killer a flat purse
 * plus half the victim's bounty, grows the killer's own bounty, and resets the victim to the base.
 * Highest bounty wins the round.
 */
export const BOUNTY_START = 100;
/** a killer's own bounty grows by this much per KO */
export const BOUNTY_PER_KO = 100;
/** flat part of the KO purse */
export const KO_PURSE = 50;
/** share of the victim's bounty that ends up in the killer's purse */
export const KO_BOUNTY_FRAC = 0.5;
/** doubloon pickups a KO'd fighter drops on the deck */
export const KO_COINS = 3;

const safe = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0);

/** Doubloons the killer collects for KO'ing a fighter worth `victimBounty` (floored, so gold is whole). */
export function koPurse(victimBounty: number): number {
  return KO_PURSE + Math.floor(safe(victimBounty) * KO_BOUNTY_FRAC);
}

/** The killer's own bounty after a KO. `mult` > 1 pays the PLUNDER bonus (Saltwind, T20). */
export function bountyAfterKO(killerBounty: number, mult = 1): number {
  const m = Number.isFinite(mult) && mult > 0 ? mult : 1;
  return safe(killerBounty) + Math.round(BOUNTY_PER_KO * m);
}

/** The victim's bounty after being KO'd: back to the base purse. */
export function bountyAfterDeath(): number {
  return BOUNTY_START;
}

/**
 * The crown holder: the highest bounty among the living, with ties going to the first in id order
 * so every client draws the marker on the same body. Returns null when nobody is alive.
 */
export function crownHolder<T extends { id: number; bounty: number; down?: boolean }>(ps: T[]): T | null {
  let best: T | null = null;
  for (const p of ps) {
    if (p.down) continue;
    if (!best || p.bounty > best.bounty || (p.bounty === best.bounty && p.id < best.id)) best = p;
  }
  return best;
}
