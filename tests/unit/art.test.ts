import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ART, FACTION_COLOR } from '../../client/src/art/manifest.ts';

const DIR = join(process.cwd(), 'client/public/art');
const read = (file: string): string => readFileSync(join(DIR, file), 'utf8');
const fills = (svg: string): Set<string> =>
  new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase()));

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

describe('fighter art (client/public/art)', () => {
  for (const art of ART) {
    describe(art.id, () => {
      const base = read(`${art.id}.svg`);
      const hurt = read(`${art.id}-hurt.svg`);

      it('uses the shared 128 px canvas', () => {
        for (const svg of [base, hurt]) {
          expect(svg).toContain('viewBox="0 0 128 128"');
          expect(svg).toContain('width="128"');
          expect(svg).toContain('height="128"');
        }
      });

      it('is outlined in the house colour at 4 px or more', () => {
        for (const svg of [base, hurt]) {
          expect(svg).toContain('#1b1b2f');
          const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
          expect(Math.max(...widths)).toBeGreaterThanOrEqual(4);
        }
      });

      it('is flat art: 5–9 colours, no raster, no external refs', () => {
        const colours = fills(base);
        expect(colours.size).toBeGreaterThanOrEqual(5);
        expect(colours.size).toBeLessThanOrEqual(9);
        for (const svg of [base, hurt]) {
          expect(svg).not.toContain('<image');
          expect(svg).not.toContain('data:image');
          expect(svg).not.toContain('href=');
          expect(svg).not.toContain('filter=');
        }
      });

      it('carries the faction accent colour', () => {
        expect(fills(base).has(hex(FACTION_COLOR[art.faction]))).toBe(true);
      });

      it('ships a hurt face with the same body and an open mouth', () => {
        // every body colour of the neutral pose survives; only the white sclera may disappear
        for (const colour of fills(base)) {
          if (colour === '#ffffff' || colour === '#1b1b2f') continue;
          expect(fills(hurt).has(colour)).toBe(true);
        }
        expect(hurt).not.toBe(base);
        // open mouth = a filled dark path (the neutral face only has dark pupils and lines)
        expect(/<path\b[^>]*fill="#1b1b2f"/.test(hurt)).toBe(true);
      });
    });
  }

  it('has no orphan SVGs and no missing ones', () => {
    const onDisk = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
    const expected = ART.flatMap((a) => [`${a.id}.svg`, `${a.id}-hurt.svg`]).sort();
    expect(onDisk.sort()).toEqual(expected);
  });
});
