/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

type Look = { id: number; sheet: boolean; tex: string; frame: string; flip: boolean; depth: number };
const looks = (page: Page): Promise<Look[]> => page.evaluate(() => (window as any).__brawl.looks);

// T37: Voltbun plays its 3D sheet (skinned copy for skin 1), other fighters keep the SVG, ?art=svg forces SVG
test('sheet fighters play their atlas frames, the rest stay SVG', async ({ page }) => {
  const room = 'sheet-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&skin=1&bots=2&botf=voltbun,mira`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await looks(page)).length).toBe(3);
  const me = await page.evaluate(() => (window as any).__brawl.id);
  await expect
    .poll(async () => (await looks(page)).find((l) => l.id === me))
    .toMatchObject({ sheet: true, tex: 'sheet-voltbun-s1' });
  const all = await looks(page);
  const bots = all.filter((l) => l.id !== me);
  expect(bots.map((l) => l.sheet).sort()).toEqual([false, true]);
  expect(bots.find((l) => l.sheet)?.tex).toBe('sheet-voltbun');
  expect(bots.find((l) => !l.sheet)?.tex).toMatch(/^art-mira/);
  for (const l of all) {
    expect(l.depth).toBeGreaterThanOrEqual(20);
    expect(l.depth).toBeLessThanOrEqual(21);
  }
  expect(all.find((l) => l.id === me)?.frame).toMatch(/^(idle|run|attack|hurt)_(S|SE|E|NE|N)_\d$/);
});

test('?art=svg keeps the flat look', async ({ page }) => {
  const room = 'sheetsvg-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&bots=0&art=svg`);
  await expect.poll(async () => (await looks(page)).length).toBe(1);
  expect((await looks(page))[0]).toMatchObject({ sheet: false, tex: 'art-voltbun' });
});
