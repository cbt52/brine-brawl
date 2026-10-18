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
  // the replay plays two seconds of history, then hands back to the live (dead) view; `replaying` is
  // judged on the replay's own clock (2.5 s), so the 5 s here is only a failsafe, not the expected time
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.replaying), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});

// landscape on purpose: the portrait rotate hint (mobile project) covers the game otherwise
test.describe('tap to skip', () => {
  test.use({ viewport: { width: 915, height: 412 } });

  test('a tap ends the kill-cam replay early', async ({ page }) => {
    await page.goto('/?room=killcam-' + Math.random().toString(36).slice(2, 8) + '&name=Diver&bots=2&fighter=mira');
    await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.st), { timeout: 20_000 }).toBe('playing');

    await page.evaluate(() => (window as any).__brawl.send({ t: 'dbg', op: 'kill' }));
    await expect.poll(() => page.evaluate(() => (window as any).__brawl.replaying), { timeout: 3_000 }).toBe(true);
    // a tap (touch on the phone project, click on desktop) skips the rest of it (about 2.5 s in all)
    if (test.info().project.name === 'mobile') await page.touchscreen.tap(200, 200);
    else await page.mouse.click(200, 200);
    await expect.poll(() => page.evaluate(() => (window as any).__brawl.replaying), { timeout: 1_000 }).toBe(false);
  });
});
