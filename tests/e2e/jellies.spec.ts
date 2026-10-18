/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

/**
 * Jellyfish rain (backlog #30, slice 2b): a debug `wx` op forces the round into jelly rain, the
 * snapshot then carries the jellies and the match info names the modifier. The screenshot is the
 * visual check for the jellies over the sand.
 */
test('a jelly-rain round sends its jellies and draws them without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?room=jellies-' + Math.random().toString(36).slice(2, 8) + '&name=Stinger&bots=2&fighter=mira');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.st), { timeout: 20_000 }).toBe('playing');

  await page.evaluate(() => (window as any).__brawl.send({ t: 'dbg', op: 'wx', v: 'jelly-rain' }));
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.wx), { timeout: 3_000 }).toBe('jelly-rain');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.jl?.length ?? 0), { timeout: 3_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.loop/shots/T99-jellies.png' });
  expect(errors).toEqual([]);
});
