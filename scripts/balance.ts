import { mkdirSync, writeFileSync } from 'node:fs';
import { formatReport, runBalance } from './lib/balance.ts';

/**
 * Balance harness: headless sim, bot-driven, no network.
 *   npm run balance           full pass (~66 pairs × 10 seeds × 60 s + 20 FFAs)
 *   npm run balance -- --quick small pass for CI
 * Writes `.loop/balance.md` (full) or `.loop/balance-quick.md` (--quick), so a noisy quick run
 * never clobbers the recorded full matrix.
 */
const quick = process.argv.includes('--quick') || process.argv.includes('-q');
const rep = runBalance({ quick });
const out = quick ? '.loop/balance-quick.md' : '.loop/balance.md';
mkdirSync('.loop', { recursive: true });
writeFileSync(out, formatReport(rep));

const band = rep.outliers.length ? `${rep.outliers.length} outlier(s)` : 'all inside 40–60 %';
console.log(`balance${quick ? ' (quick)' : ''}: ${rep.ms} ms · ${band}`);
for (const t of rep.outliers) console.log(`  ${t.fighter.padEnd(12)} ${Math.round(t.winrate * 100)}% (${t.wins}/${t.matches})`);
