/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

type Water = { lagoon: boolean; pools: number; level: number; still: boolean };
const water = (page: Page): Promise<Water | null> => page.evaluate(() => (window as any).__brawl.water);

// T44: lagoon caustics tile + flooded pools; static water in lowfx
test('docks: scrolling lagoon caustics, the pools flood at high tide', async ({ page }) => {
  const room = 'water-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&bots=0&tide=high`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await water(page))?.level).toBe(1);
  const w = (await water(page))!;
  expect(w.lagoon).toBe(true);
  expect(w.pools).toBeGreaterThan(0);
  expect(w.still).toBe(false);
});

test('lowfx: the water stands still', async ({ page }) => {
  const room = 'waterlow-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&bots=0&tide=high&lowfx=1`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await water(page))?.still).toBe(true);
});

test('?art=svg: no caustics tile, the flood overlay still draws', async ({ page }) => {
  const room = 'watersvg-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&bots=0&tide=high&art=svg`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await water(page))?.level).toBe(1);
  expect(await water(page)).toMatchObject({ lagoon: false, pools: 0 });
});
