import { mkdirSync, writeFileSync } from 'node:fs';
import { formatReport, runBalance } from './lib/balance.ts';

/**
 * Balance harness: headless sim, bot-driven, no network.
 *   npm run balance           full pass (~66 pairs × 10 seeds × 60 s + 20 FFAs)
 *   npm run balance -- --quick small pass for CI
 * Writes `.loop/balance.md`.
 */
const quick = process.argv.includes('--quick') || process.argv.includes('-q');
const rep = runBalance({ quick });
mkdirSync('.loop', { recursive: true });
writeFileSync('.loop/balance.md', formatReport(rep));

const band = rep.outliers.length ? `${rep.outliers.length} outlier(s)` : 'all inside 40–60 %';
console.log(`balance${quick ? ' (quick)' : ''}: ${rep.ms} ms · ${band}`);
for (const t of rep.outliers) console.log(`  ${t.fighter.padEnd(12)} ${Math.round(t.winrate * 100)}% (${t.wins}/${t.matches})`);
