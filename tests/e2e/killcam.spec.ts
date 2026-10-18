/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

/**
 * Kill-cam (backlog #5): our KO replays the lead-up on screen for about 2 s, then the replay ends
 * and the camera stays on the killer. The replay is drawn on the Phaser canvas, so the spec reads
 * it through the `__brawl.replaying` hook; a debug self-KO has no attacker, so the replay follows us.
 */
test('a KO replays the lead-up, then the replay ends without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?room=killcam-' + Math.random().toString(36).slice(2, 8) + '&name=Diver&bots=2&fighter=mira');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.st), { timeout: 20_000 }).toBe('playing');

  await page.evaluate(() => (window as any).__brawl.send({ t: 'dbg', op: 'kill' }));
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.replaying), { timeout: 3_000 }).toBe(true);
  // the replay plays two seconds of history, then hands back to the live (dead) view
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.replaying), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});
