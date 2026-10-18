import { TICK_HZ } from '../../shared/constants.ts';
import { getFighter, SELECTABLE } from '../../shared/fighters/index.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { World } from '../../shared/sim/world.ts';

/** fixed sim step, so a seed replays the same match on every machine */
const DT = 1 / TICK_HZ;

export interface BalanceOpts {
  /** seeds per fighter pair (and 6-bot FFA rounds) */
  seeds?: number;
  /** match length in seconds */
  secs?: number;
  /** FFA rounds */
  ffaSeeds?: number;
  /** small run for CI: fewer seeds, shorter matches */
  quick?: boolean;
}

export interface SlotStats {
  fighter: string;
  kos: number;
  deaths: number;
  dmg: number;
}

export interface MatchResult {
  /** slot index of the winner, null on a draw */
  winner: number | null;
  slots: SlotStats[];
}

export interface Tally {
  fighter: string;
  name: string;
  matches: number;
  wins: number;
  /** 0…1 */
  winrate: number;
  kos: number;
  deaths: number;
  dmg: number;
  /** damage dealt per KO (∞ → 0 when it never KO'd) */
  dmgPerKo: number;
  /** FFA only: average finishing place (1 = best) */
  place: number;
}

export interface Report {
  quick: boolean;
  seeds: number;
  secs: number;
  ffaSeeds: number;
  /** wall-clock ms the whole run took */
  ms: number;
  /** 1v1 overall, sorted by winrate descending */
  overall: Tally[];
  /** winrate of `matrix[attacker][defender]` over the pair seeds */
  matrix: Record<string, Record<string, number>>;
  /** 6-bot free-for-all */
  ffa: Tally[];
  /** fighters outside the 40–60 % band (the balance pass works on these) */
  outliers: Tally[];
}

/** mulberry32 — tiny deterministic PRNG so one seed reproduces one match. */
export function seeded(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One headless match: bots drive their own inputs, no network, fixed dt. */
export function runMatch(fighters: string[], seed: number, secs: number): MatchResult {
  const w = new World();
  const rng = seeded(seed);
  const brains: BotBrain[] = [];
  fighters.forEach((f, i) => {
    const id = i + 1;
    w.addPlayer(id, `b${id}`, f, true);
    brains.push(new BotBrain(id, 'normal', rng));
  });
  const slots: SlotStats[] = fighters.map((f) => ({ fighter: getFighter(f).id, kos: 0, deaths: 0, dmg: 0 }));
  const ticks = Math.max(1, Math.round(secs * TICK_HZ));
  for (let t = 0; t < ticks; t++) {
    for (const b of brains) w.setInput(b.id, b.think(w, DT));
    w.step(DT);
    for (const e of w.events) {
      if (e.k !== 'hit') continue;
      const slot = slots[e.a - 1];
      // self-damage never counts as dealt damage
      if (slot && e.a !== e.v) slot.dmg += e.dmg;
    }
    w.clearEvents();
  }
  for (const p of w.players.values()) {
    const slot = slots[p.id - 1];
    if (!slot) continue;
    slot.kos = p.kos;
    slot.deaths = p.deaths;
  }
  // Mirror the game's own scoreboard order (server/match.ts rankPlayers): KOs, then fewer deaths.
  // Damage dealt is the harness-only tiebreak, so a low-KO match still produces a verdict.
  const score = (s: SlotStats): number => s.kos * 1e6 - s.deaths * 1e3 + Math.min(999, Math.round(s.dmg));
  let best = -Infinity;
  let top = 0;
  let tie = false;
  for (const s of slots) {
    const v = score(s);
    if (v > best) { best = v; top = slots.indexOf(s); tie = false; } else if (v === best) tie = true;
  }
  return { winner: tie ? null : top, slots };
}

/** Seeds that make the pair run deterministic regardless of the pair order. */
const pairSeed = (a: number, b: number, i: number): number => (a * 7919 + b * 104729 + i * 2654435761) >>> 0;

interface Acc {
  fighter: string;
  matches: number;
  wins: number;
  kos: number;
  deaths: number;
  dmg: number;
  place: number;
}

const blank = (fighter: string): Acc => ({ fighter, matches: 0, wins: 0, kos: 0, deaths: 0, dmg: 0, place: 0 });

function finish(a: Acc, name: string): Tally {
  return {
    fighter: a.fighter,
    name,
    matches: a.matches,
    wins: a.wins,
    winrate: a.matches ? a.wins / a.matches : 0,
    kos: a.kos,
    deaths: a.deaths,
    dmg: Math.round(a.dmg),
    dmgPerKo: a.kos ? Math.round(a.dmg / a.kos) : 0,
    place: a.matches ? Math.round((a.place / a.matches) * 100) / 100 : 0,
  };
}

function bump(map: Map<string, Acc>, fighter: string): Acc {
  let a = map.get(fighter);
  if (!a) { a = blank(fighter); map.set(fighter, a); }
  return a;
}

export function runBalance(opts: BalanceOpts = {}): Report {
  const t0 = Date.now();
  const quick = opts.quick ?? false;
  const seeds = Math.max(1, opts.seeds ?? (quick ? 2 : 10));
  const secs = Math.max(5, opts.secs ?? (quick ? 30 : 60));
  const ffaSeeds = Math.max(1, opts.ffaSeeds ?? (quick ? 2 : 20));

  const ids = SELECTABLE.map((d) => d.id);
  const overall = new Map<string, Acc>(ids.map((id) => [id, blank(id)]));
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    matrix[a] = {};
    for (const b of ids) if (a !== b) matrix[a][b] = 0;
  }

  for (let ai = 0; ai < ids.length; ai++) {
    for (let bi = ai + 1; bi < ids.length; bi++) {
      const a = ids[ai];
      const b = ids[bi];
      let aWins = 0;
      for (let s = 0; s < seeds; s++) {
        const r = runMatch([a, b], pairSeed(ai, bi, s), secs);
        for (const slot of r.slots) {
          const acc = bump(overall, slot.fighter);
          acc.matches++;
          acc.kos += slot.kos;
          acc.deaths += slot.deaths;
          acc.dmg += slot.dmg;
        }
        if (r.winner === 0) { aWins++; bump(overall, a).wins++; } else if (r.winner === 1) { bump(overall, b).wins++; }
      }
      // both directions from the same seeds: run() is not symmetric (spawn order), so mirror the rate
      matrix[a][b] = aWins / seeds;
      matrix[b][a] = 1 - aWins / seeds;
    }
  }

  const ffa = new Map<string, Acc>(ids.map((id) => [id, blank(id)]));
  const roster = ids.slice();
  for (let s = 0; s < ffaSeeds; s++) {
    const rng = seeded(pairSeed(9973, s, 17));
    // seeded shuffle, then take six distinct kits
    const pool = roster.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = pool.slice(0, 6);
    const r = runMatch(picks, pairSeed(31, s, 7919), secs);
    // finishing place: KOs desc, then deaths asc
    const order = r.slots.map((slot, i) => ({ slot, i }))
      .sort((x, y) => y.slot.kos - x.slot.kos || x.slot.deaths - y.slot.deaths);
    order.forEach((entry, place) => {
      const acc = bump(ffa, entry.slot.fighter);
      acc.matches++;
      acc.kos += entry.slot.kos;
      acc.deaths += entry.slot.deaths;
      acc.dmg += entry.slot.dmg;
      acc.place += place + 1;
      if (place === 0) acc.wins++;
    });
  }

  const nameOf = (id: string): string => getFighter(id).name;
  const sortByWin = (a: Tally, b: Tally): number => b.winrate - a.winrate || a.name.localeCompare(b.name);
  const overallList = [...overall.values()].map((a) => finish(a, nameOf(a.fighter))).sort(sortByWin);
  const ffaList = [...ffa.values()].map((a) => finish(a, nameOf(a.fighter))).sort(sortByWin);
  const outliers = overallList.filter((t) => t.matches > 0 && (t.winrate < 0.4 || t.winrate > 0.6));

  return { quick, seeds, secs, ffaSeeds, ms: Date.now() - t0, overall: overallList, matrix, ffa: ffaList, outliers };
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;

/**
 * Data history of the T25 pass (≤10 % per step, 3 passes). The bot AI fix came first: melee bots used
 * the ranged 380 u stand-off, which made every melee kit lose and the harness useless.
 */
const EDITS: readonly string[] = [
  'Harness fix — `shared/sim/bot.ts`: prefer range from the kit’s own reach (melee 0.75×reach, ranged ≤380) instead of a flat 380 u; melee bots now actually swing.',
  'Pass 1 (11 outliers) — voltbun dmg 11→10 reload 0.9→0.98 · pip hp 95→90 reload 0.95→1.03 · mossback hp 165→155 reload 1.4→1.52 · pinchpenny dmg 10→9 reload 1.35→1.45 · noodle dash 26→24 · brak spd 0.9→0.95 reach 170→185 dmg 24→26 · mira hp 105→112 spd 1→1.06 · sable reach 185→198 dmg 15→16 · hammy reach 150→162 dmg 13→14 · embercub reach 200→215 dmg 21→22 · bisque reach 170→182 dmg 19→20.',
  'Pass 2 (7 outliers) — voltbun hp 90→85 spd 1.2→1.14 · noodle hp 145→138 reload 1.25→1.33 · embercub hp 140→133 spc cd 7→7.5 · mira spd 1.06→1.02 · pinchpenny reverted (dmg 10, reload 1.35) hp 150→158 · sudsy hp 120→128 reload 1.3→1.22 spd 1→1.05 · hammy hp 112→119 spd 1.14→1.2 reload 0.7→0.66.',
  'Pass 3 (5 outliers) — voltbun hp 85→80 dmg 10→9 reload 0.98→1.05 · noodle hp 138→131 reload 1.33→1.42 dash 360→340 · embercub hp 133→126 dash 18→17 · pinchpenny hp 158→168 spd 0.92→0.99 · sudsy hp 128→136 spd 1.05→1.11 · hammy reach 162→172 dmg 14→15 · brak spd 0.95→1.01 dmg 26→28.',
  'Left open (3-pass budget spent): noodle / embercub / voltbun still >60 %, pinchpenny / sudsy still <40 % — mobility (dash kits) decides bot duels more than the numbers do, so the next pass belongs in T99 or T33.',
];

/** Markdown report written to `.loop/balance.md`. */
export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push(`# Balance${r.quick ? ' (quick)' : ''} — ${r.overall.reduce((n, t) => n + t.matches, 0) / 2} 1v1s`);
  lines.push('');
  lines.push(`Mode: ${r.seeds} seeds × ${r.secs} s per pair · FFA ${r.ffaSeeds} × 6 bots × ${r.secs} s · ${r.ms} ms`);
  lines.push(`Band: winrate 40–60 % → **${r.outliers.length ? `${r.outliers.length} outlier(s)` : 'all inside'}**`);
  lines.push('');
  lines.push('## Overall 1v1');
  lines.push('');
  lines.push('| # | Fighter | Winrate | W/M | KOs | Deaths | Dmg/KO |');
  lines.push('|---|---|---|---|---|---|---|');
  r.overall.forEach((t, i) => {
    lines.push(`| ${i + 1} | ${t.name} \`${t.fighter}\` | ${pct(t.winrate)} | ${t.wins}/${t.matches} | ${t.kos} | ${t.deaths} | ${t.dmgPerKo} |`);
  });
  lines.push('');
  lines.push('## FFA (6 bots)');
  lines.push('');
  lines.push('| Fighter | Top-1 | Matches | Avg place | Dmg/KO |');
  lines.push('|---|---|---|---|---|');
  for (const t of r.ffa) {
    if (!t.matches) continue;
    lines.push(`| ${t.name} \`${t.fighter}\` | ${pct(t.winrate)} | ${t.matches} | ${t.place} | ${t.dmgPerKo} |`);
  }
  lines.push('');
  lines.push('## Pair matrix (row winrate vs column)');
  lines.push('');
  const ids = r.overall.map((t) => t.fighter);
  const short = (id: string): string => id.slice(0, 4);
  lines.push(`| | ${ids.map(short).join(' | ')} |`);
  lines.push(`|---|${ids.map(() => '---').join('|')}|`);
  for (const a of ids) {
    const cells = ids.map((b) => (a === b ? '·' : r.matrix[a][b] === undefined ? '' : pct(r.matrix[a][b])));
    lines.push(`| **${short(a)}** | ${cells.join(' | ')} |`);
  }
  if (r.outliers.length) {
    lines.push('');
    lines.push('## Outliers (outside 40–60 %)');
    lines.push('');
    for (const t of r.outliers) lines.push(`- ${t.name} \`${t.fighter}\` — ${pct(t.winrate)} of ${t.matches} (dmg/KO ${t.dmgPerKo})`);
  }
  lines.push('');
  lines.push('## Balance edits (T25)');
  lines.push('');
  for (const e of EDITS) lines.push(`- ${e}`);
  return `${lines.join('\n')}\n`;
}
