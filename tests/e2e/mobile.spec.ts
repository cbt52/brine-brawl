/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';
import { Touch } from './helpers/touch.ts';

test.use({ viewport: { width: 915, height: 412 } });

type P = { id: number; x: number; y: number; am: number };
const players = (page: Page) => page.evaluate(() => ((window as any).__brawl.state()?.players ?? []) as P[]);
const me = async (page: Page) => {
  const id = await page.evaluate(() => (window as any).__brawl.id as number);
  return (await players(page)).find((p) => p.id === id)!;
};

test('touch: left stick moves, right tap fires', async ({ page }) => {
  await page.goto('/?room=m-' + Math.random().toString(36).slice(2, 8) + '&name=Phone');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await me(page))?.x).toBeGreaterThan(0);
  await expect(page.getByTestId('btn-special')).toBeVisible();
  await expect(page.getByTestId('rotate')).toBeHidden();

  const t = await Touch.create(page);
  const x0 = (await me(page)).x;
  await t.drag({ x: 150, y: 250 }, { x: 250, y: 250 }, 500);
  await expect.poll(async () => Math.abs((await me(page)).x - x0)).toBeGreaterThan(40);

  await page.waitForTimeout(1700); // spawn shield
  const ammo0 = (await me(page)).am;
  // a tap fires toward the nearest enemy; CDP touch dispatch occasionally swallows one, so retry
  let am = ammo0;
  for (let i = 0; i < 3 && am >= ammo0; i++) {
    await t.tap({ x: 700, y: 200 });
    await page.waitForTimeout(350);
    am = (await me(page)).am;
  }
  expect(am).toBeLessThan(ammo0);
});
