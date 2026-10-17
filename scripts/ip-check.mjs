import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  'pokemon', 'pikachu', 'pokeball', 'bender', 'bending', 'aang', 'katara', 'toph', 'zuko',
  'luffy', 'straw hat', 'devil fruit', 'gomu', 'haki', 'zoro', 'spongebob', 'squarepants',
  'patrick', 'krusty', 'krabby', 'bikini bottom', 'squidward', 'plankton', 'gary',
];
const ROOTS = ['client', 'server', 'shared'];
const SKIP = new Set(['node_modules', 'dist']);
const EXT = /\.(ts|js|mjs|html|css|svg|json|md)$/;

let hits = 0;

function scan(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const low = line.toLowerCase();
    for (const w of FORBIDDEN) {
      if (low.includes(w)) {
        console.error(`${file}:${i + 1}: forbidden term "${w}"`);
        hits++;
      }
    }
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(name)) scan(p);
  }
}

for (const r of ROOTS) {
  try {
    walk(r);
  } catch {
    /* root missing */
  }
}
if (hits) process.exit(1);
console.log('ip-check: ok');
