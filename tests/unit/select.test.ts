import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { SELECTABLE } from '../../shared/fighters/index.ts';
import { fighterCardsHtml, fighterRowHtml, setRowSkin } from '../../client/src/ui/select.ts';
import { artUrl } from '../../client/src/art/manifest.ts';
import { escapeHtml } from '../../client/src/ui/util.ts';

const root = new URL('../../', import.meta.url);

describe('character select cards (T33)', () => {
  it('every selectable kit carries a short bio', () => {
    for (const f of SELECTABLE) {
      expect(f.blurb.trim().length, f.id).toBeGreaterThan(12);
      expect(f.blurb.length, f.id).toBeLessThanOrEqual(140);
    }
  });

  it('renders the bio, the faction and the card testid', () => {
    const html = fighterCardsHtml('voltbun');
    const card = html.split('<button class="card"').find((c) => c.includes('data-fighter="voltbun"'))!;
    expect(card).toContain('data-faction="critterkin"');
    expect(card).toContain('data-testid="fighter-card-voltbun"');
    expect(card).toContain('A cheeky battery-tailed bunny');
    expect(card).toContain('aria-pressed="true"');
  });

  it('only the saved card starts pressed', () => {
    const html = fighterCardsHtml('sudsy');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/data-faction="/g)).toHaveLength(SELECTABLE.length);
  });
});

describe('menu fighter row faces (backlog #29)', () => {
  it('every ☰ button carries its own face at the drawn look', () => {
    const html = fighterRowHtml('pebblor');
    for (const f of SELECTABLE) {
      const btn = html.split('<button ').find((b) => b.includes(`data-fighter="${f.id}"`))!;
      expect(btn, f.id).toContain(`<img class="pick-face" src="${artUrl(f.id)}" alt=""`);
      expect(btn, f.id).toContain(escapeHtml(f.name));
    }
    expect(html.match(/class="big sm pick on"/g)).toHaveLength(1);
  });

  it('setRowSkin remembers the skin and points each face at the drawn look for skin 0', async () => {
    const img = { src: 'stale' } as HTMLImageElement;
    const btn = { dataset: { fighter: 'voltbun' }, querySelector: () => img };
    const root = { dataset: {} as Record<string, string>, querySelectorAll: () => [btn] } as unknown as HTMLElement;
    setRowSkin(root, 0);
    await Promise.resolve();
    expect(root.dataset.skin).toBe('0');
    expect(img.src).toBe(artUrl('voltbun'));
  });
});

describe('PWA manifest (T33)', () => {
  const manifest = JSON.parse(readFileSync(new URL('client/public/manifest.webmanifest', root), 'utf8'));

  it('is installable: name, start_url, standalone display and 192 + 512 icons', () => {
    expect(manifest.name).toBe('Brine Brawl');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('ships every icon file at the declared pixel size', () => {
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const file = new URL(`client/public${icon.src}`, root);
      expect(existsSync(file), icon.src).toBe(true);
      const png = readFileSync(file);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(png.readUInt32BE(16), icon.src).toBe(w);
      expect(png.readUInt32BE(20), icon.src).toBe(h);
    }
  });

  it('registers a service worker (the installability fetch handler)', () => {
    const sw = readFileSync(new URL('client/public/sw.js', root), 'utf8');
    expect(sw).toContain("addEventListener('fetch'");
  });

  it('links the manifest and theme colour from the page', () => {
    const html = readFileSync(new URL('client/index.html', root), 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('rel="apple-touch-icon"');
  });
});
