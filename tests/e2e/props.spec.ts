/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

type Prop = { frame: string; kind: string; x: number; y: number; depth: number };
const props = (page: Page): Promise<Prop[]> => page.evaluate(() => (window as any).__brawl.props);

// T43: the docks walls, barrels/crates and kelp are atlas sprites, y-sorted with the fighters
test('docks props are placed as y-sorted sprites, kelp above the fighters', async ({ page }) => {
  const room = 'props-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&bots=1`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await props(page)).length).toBe(30);
  const all = await props(page);
  const count = (k: string) => all.filter((p) => p.kind === k).length;
  expect([count('wall'), count('barrel') + count('crate'), count('kelp')]).toEqual([12, 8, 10]);
  for (const p of all) {
    if (p.kind === 'kelp') expect(p.depth).toBe(26);
    else expect(p.depth).toBeCloseTo(20 + p.y / 1600, 6);
  }
  const looks: { depth: number }[] = await page.evaluate(() => (window as any).__brawl.looks);
  for (const l of looks) expect(l.depth).toBeLessThan(26);
});

test('?art=svg keeps the painted props', async ({ page }) => {
  const room = 'propsvg-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&bots=0&art=svg`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  expect(await props(page)).toEqual([]);
});
