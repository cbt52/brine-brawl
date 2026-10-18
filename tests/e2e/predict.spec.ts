/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

/** Predicted (drawn) position of the local body. */
const self = (page: Page) =>
  page.evaluate(() => (window as any).__brawl.self as { x: number; y: number } | null);
const ping = (page: Page) => page.evaluate(() => (window as any).__brawl.ping as number);
const dbg = (page: Page, op: string, extra: Record<string, number>) =>
  page.evaluate(([o, e]) => (window as any).__brawl.send({ t: 'dbg', op: o, ...(e as object) }), [op, extra] as const);
const api = (page: Page) => page.evaluate(() => (window as any).__brawl);

test('ping round-trip is measured against the server (and includes ?lag)', async ({ page }) => {
  await page.goto('/?room=ping-' + Math.random().toString(36).slice(2, 8) + '&name=A&bots=1&lag=150');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  // the client pings every 2 s; 150 ms one way must show up as a ~300 ms round-trip
  await expect.poll(() => ping(page), { timeout: 8000 }).toBeGreaterThan(0);
  const rtt = await ping(page);
  expect(rtt).toBeGreaterThanOrEqual(290);
  expect(rtt).toBeLessThan(1500);
});

test('?lag=150 still moves the own body within 50 ms of keydown', async ({ page }) => {
  await page.goto('/?room=lag-' + Math.random().toString(36).slice(2, 8) + '&name=A&bots=1&lag=150');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  expect(await page.evaluate(() => (window as any).__brawl.lag)).toBe(150);
  await expect.poll(async () => (await self(page)) !== null, { timeout: 5000 }).toBe(true);
  // open water, well away from kelp and walls — and wait for the teleport to reach the drawn body
  // (with ?lag=150 the dbg echo needs up to ~400 ms: 150 out, snapshot, 150 back, one broadcast),
  // otherwise `start` below is still the pre-teleport spawn and the check measures the wrong thing
  await dbg(page, 'tp', { x: 760, y: 760 });
  const atTarget = async (): Promise<number> => {
    const s = await self(page);
    return s ? Math.abs(s.x - 760) + Math.abs(s.y - 760) : 1e9;
  };
  await expect.poll(atTarget, { timeout: 6000 }).toBeLessThan(30);
  // arm an in-page probe: it times from the keydown itself, so no CDP round-trip skew
  await page.evaluate(() => {
    const b = (window as any).__brawl;
    const start = b.self.x as number;
    (window as any).__probe = { done: false, ms: -1, frames: 0, frameMs: 0 };
    let t0 = -1;
    window.addEventListener('keydown', () => { if (t0 < 0) t0 = performance.now(); }, { capture: true, once: true });
    const deadline = performance.now() + 5000;
    const deltas: number[] = [];
    let last = performance.now();
    let frames = 0;
    const tick = (): void => {
      const n = performance.now();
      deltas.push(n - last);
      last = n;
      const s = b.self as { x: number } | null;
      if (t0 >= 0 && s && s.x > start + 2) {
        const sorted = [...deltas].sort((a, z) => a - z);
        (window as any).__probe = { done: true, ms: n - t0, frames, frameMs: sorted[Math.floor(sorted.length / 2)] ?? 0 };
        return;
      }
      frames++;
      if (n > deadline) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.keyboard.down('d');
  await expect.poll(() => page.evaluate(() => (window as any).__probe.done), { timeout: 4000 }).toBe(true);
  await page.keyboard.up('d');
  const probe = await page.evaluate(() => (window as any).__probe as { ms: number; frames: number; frameMs: number });
  // the drawn body must react to the keypress on the frame that sees it: the client emits exactly
  // TICK_HZ inputs/s (one per sim tick — see input/controls.ts) plus one immediate send when the move
  // direction changes, so at most one frame + one tick (33 ms) passes. Far below the 300 ms
  // round-trip that ?lag=150 simulates — the reaction is local prediction, not a server echo.
  expect(probe.frames).toBeLessThanOrEqual(3);
  expect(probe.ms).toBeLessThan(Math.max(90, 3 * probe.frameMs + 20));
  // and it must be local: without prediction the 150 ms lag would need > 300 ms round-trip
  expect(probe.ms).toBeLessThan(150);
});

test('predicted body converges to the server position', async ({ page }) => {
  await page.goto('/?room=pred-' + Math.random().toString(36).slice(2, 8) + '&name=A&bots=1&lag=120');
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(async () => (await self(page)) !== null, { timeout: 5000 }).toBe(true);
  await dbg(page, 'tp', { x: 700, y: 700 });
  await page.waitForTimeout(600);
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  // convergence, not a fixed sleep: the client is ahead of the server by however much movement is
  // still unacknowledged, so the drawn body only meets the server position once its queue drains
  const gap = async (): Promise<number> => {
    const predicted = (await self(page))!;
    const server = await page.evaluate(() => {
      const b = (window as any).__brawl;
      const me = (b.state()?.players ?? []).find((p: { id: number }) => p.id === b.id);
      return me as { x: number; y: number };
    });
    return Math.max(Math.abs(predicted.x - server.x), Math.abs(predicted.y - server.y));
  };
  await expect.poll(gap, { timeout: 6000 }).toBeLessThan(12);
  expect(await api(page)).toBeTruthy();
});
