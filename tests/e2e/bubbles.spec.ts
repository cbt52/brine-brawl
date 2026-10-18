/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

/**
 * Bubble storm (backlog #17, slice 2a): a debug `wx` op forces the round into the bubble storm, the
 * snapshot then carries the bubbles and the match info names the modifier. The screenshot is the
 * visual check for the bubbles over the sand.
 */
test('a bubble-storm round sends its bubbles and draws them without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?room=bubbles-' + Math.random().toString(36).slice(2, 8) + '&name=Floater&bots=2&fighter=mira');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.st), { timeout: 20_000 }).toBe('playing');

  await page.evaluate(() => (window as any).__brawl.send({ t: 'dbg', op: 'wx', v: 'bubble-storm' }));
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.wx), { timeout: 3_000 }).toBe('bubble-storm');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.bb?.length ?? 0), { timeout: 3_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.loop/shots/T99-bubbles.png' });
  expect(errors).toEqual([]);
});
