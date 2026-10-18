/**
 * Most KOs ribbon (backlog #32): the round's top KO fighter gets a "MOST KOS" tag on the results poster.
 * `koTicks` is the sim tick of each KO this round, oldest first.
 */
export interface KoLog {
  id: number;
  koTicks: number[];
}

/**
 * The fighter with the most KOs this round, or null when nobody scored. A tie goes to whoever reached
 * that count first (their last KO came earliest), then to the lower id so every client agrees.
 */
export function mvpId(rows: KoLog[]): number | null {
  let best: KoLog | null = null;
  for (const r of rows) {
    const n = r.koTicks.length;
    if (n === 0) continue;
    if (!best || n > best.koTicks.length) {
      best = r;
      continue;
    }
    if (n < best.koTicks.length) continue;
    const at = r.koTicks[n - 1];
    const bestAt = best.koTicks[n - 1];
    if (at < bestAt || (at === bestAt && r.id < best.id)) best = r;
  }
  return best?.id ?? null;
}
