/* eslint-disable @typescript-eslint/no-explicit-any */
/* T46: the live FPS/perf hook exists and fills in; the 20 s phone measurement runs via `npm run perf`. */
import { test, expect, type Page } from '@playwright/test';

type Perf = { fps: number; lowfx: boolean; firstFrameMs: number; particles: number };
const perf = (page: Page): Promise<Perf | null> => page.evaluate(() => (window as any).__brawl.fps);

test('__brawl.fps reports the first frame, a live FPS sample and the quality state', async ({ page }) => {
  const room = 'perfh-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&fighter=voltbun&bots=2`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await perf(page))?.firstFrameMs ?? 0).toBeGreaterThan(0);
  await expect.poll(async () => (await perf(page))?.fps ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const p = (await perf(page))!;
  expect(p.firstFrameMs).toBeGreaterThan(0);
  expect(typeof p.lowfx).toBe('boolean');
  expect(p.particles).toBeGreaterThanOrEqual(0);
});
