/**
 * Treasure Tide (T27): a sunken chest in the middle of the lagoon spits one doubloon out of the
 * water every few seconds. Coins are *carried* (they show above the head and spill when the carrier
 * is KO'd); a crew holding enough of them starts a 15 s escape countdown that resets the moment the
 * pile shrinks. Pure data + pure functions so server, bots, tests and HUD agree.
 */
import type { TreasureInfo } from '../protocol.ts';
import type { Team } from './teams.ts';

export type { TreasureInfo };

/** Seconds between two doubloons surfacing at the sunken chest. */
export const SPAWN_SEC = 7;
/** Coins a crew must hold to start the escape countdown. */
export const WIN_COINS = 10;
/** How long the crew has to hold the pile once the countdown started. */
export const COUNTDOWN_SEC = 15;
/** Where the sunken chest sits: the middle of the central shallows (wading is slow at high tide). */
export const SPOT = { x: 1200, y: 800 };
/** Seconds a floating doubloon stays on the water before it sinks. */
export const COIN_SEC = 18;
/** How many carried coins a KO'd body can spill (a huge pile leaves a few behind). */
export const DROP_MAX = 12;

/** Team coin totals from bodies; `null`-team bodies (free-for-all) count for nobody. */
export function teamTotals(ps: readonly { team: Team | null; carry: number; down?: boolean }[]): [number, number] {
  const out: [number, number] = [0, 0];
  for (const p of ps) {
    if (p.team !== 0 && p.team !== 1) continue;
    out[p.team] += Math.max(0, p.carry);
  }
  return out;
}

/**
 * Coin economy + escape countdown. The caller feeds the crew totals and gets back whether a doubloon
 * should surface this step and which crew (if any) just won by finishing its countdown.
 */
export class Treasure {
  a = 0;
  b = 0;
  cd = 0;
  cdTeam: Team | null = null;
  /** seconds until the next doubloon surfaces */
  nextIn = SPAWN_SEC;
  /** crew that won, once a countdown ran out */
  won: Team | null = null;

  reset(): void {
    this.a = 0;
    this.b = 0;
    this.cd = 0;
    this.cdTeam = null;
    this.nextIn = SPAWN_SEC;
    this.won = null;
  }

  step(dt: number, totals: [number, number]): { spawn: boolean; win: Team | null } {
    this.a = totals[0];
    this.b = totals[1];
    let spawn = false;
    if (this.won === null) {
      this.nextIn -= dt;
      if (this.nextIn <= 0) {
        this.nextIn += SPAWN_SEC;
        spawn = true;
      }
    }
    // the countdown belongs to the crew that filled the pile first; dropping under the bar cancels it
    if (this.cdTeam !== null && totals[this.cdTeam] < WIN_COINS) {
      this.cdTeam = null;
      this.cd = 0;
    }
    if (this.cdTeam === null) {
      const lead: Team | null = totals[0] >= WIN_COINS ? 0 : totals[1] >= WIN_COINS ? 1 : null;
      if (lead !== null) {
        this.cdTeam = lead;
        this.cd = COUNTDOWN_SEC;
      }
    }
    if (this.cdTeam !== null && this.won === null) {
      this.cd -= dt;
      if (this.cd <= 0) {
        this.cd = 0;
        this.won = this.cdTeam;
      }
    }
    return { spawn, win: this.won };
  }

  info(): TreasureInfo {
    return { a: this.a, b: this.b, cd: Math.max(0, Math.ceil(this.cd)), cdTeam: this.cdTeam };
  }
}
