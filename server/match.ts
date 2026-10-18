import type { MatchInfo, MatchPhase, ScoreRow } from '../shared/protocol.ts';

export const COUNTDOWN_SEC = 3;
export const MATCH_SEC = 150;
export const RESULTS_SEC = 8;
/** humans + bots needed before a match starts */
export const MIN_COMBATANTS = 2;
export const MIN_MATCH_SEC = 5;

/** What just happened in `Match.update` (the room reacts to it). */
export type MatchEvent = 'countdown' | 'start' | 'end' | 'waiting' | null;

export interface MatchCfg {
  countdownSec: number;
  matchSec: number;
  resultsSec: number;
}

const num = (v: unknown, fallback: number, min: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : fallback;

/**
 * Room match state machine, pure and clock-free: the caller feeds fixed `dt` steps.
 * waiting (<2 combatants) → countdown 3 s → playing 150 s → results 8 s → countdown…
 */
export class Match {
  phase: MatchPhase = 'waiting';
  /** seconds left in the current phase */
  timer = 0;
  /** increments every time a match starts */
  round = 0;
  /** ranking of the last finished match (filled by the room on 'end') */
  ranking: ScoreRow[] = [];
  readonly cfg: MatchCfg;

  constructor(cfg: Partial<MatchCfg> = {}) {
    this.cfg = {
      countdownSec: num(cfg.countdownSec, COUNTDOWN_SEC, 1),
      matchSec: num(cfg.matchSec, MATCH_SEC, MIN_MATCH_SEC),
      resultsSec: num(cfg.resultsSec, RESULTS_SEC, 1),
    };
  }

  setMatchSec(sec: unknown): void {
    if (typeof sec !== 'number' || !Number.isFinite(sec)) return;
    this.cfg.matchSec = Math.max(MIN_MATCH_SEC, Math.min(MATCH_SEC, Math.round(sec)));
  }

  /** Advance the clock. `combatants` = humans + bots currently in the world. */
  update(dt: number, combatants: number): MatchEvent {
    const step = typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 0;
    const enough = combatants >= MIN_COMBATANTS;
    switch (this.phase) {
      case 'waiting':
        if (!enough) return null;
        this.beginCountdown();
        return 'countdown';
      case 'countdown':
        // the second combatant may leave mid-countdown (e.g. host removes a bot)
        if (!enough) {
          this.phase = 'waiting';
          this.timer = 0;
          return 'waiting';
        }
        this.timer -= step;
        if (this.timer > 0) return null;
        this.phase = 'playing';
        this.timer = this.cfg.matchSec;
        this.round++;
        this.ranking = [];
        return 'start';
      case 'playing':
        this.timer -= step;
        if (this.timer > 0) return null;
        this.phase = 'results';
        this.timer = this.cfg.resultsSec;
        return 'end';
      case 'results':
        this.timer -= step;
        if (this.timer > 0) return null;
        if (enough) {
          this.beginCountdown();
          return 'countdown';
        }
        this.phase = 'waiting';
        this.timer = 0;
        return 'waiting';
    }
  }

  private beginCountdown(): void {
    this.phase = 'countdown';
    this.timer = this.cfg.countdownSec;
  }

  info(): MatchInfo {
    const info: MatchInfo = { st: this.phase, t: Math.max(0, Math.ceil(this.timer)), r: this.round };
    if (this.phase === 'results') info.res = this.ranking;
    return info;
  }
}

/**
 * Bounty Brawl ranking (T19): highest bounty first, then KOs, then fewer deaths, then name.
 * Rows without a bounty (older scoreboard callers) keep the plain KO order because they all tie at 0.
 */
export function rankPlayers(
  ps: { id: number; name: string; kos: number; deaths: number; bounty?: number; fighter?: string; bot?: boolean }[],
): ScoreRow[] {
  return ps
    .map((p) => ({
      id: p.id, n: p.name, k: p.kos, d: p.deaths,
      b: typeof p.bounty === 'number' && Number.isFinite(p.bounty) ? p.bounty : 0,
      f: p.fighter ?? '', bot: p.bot ? 1 : 0,
    }))
    .sort((a, b) => b.b - a.b || b.k - a.k || a.d - b.d || a.n.localeCompare(b.n));
}
