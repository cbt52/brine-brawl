/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

type P = { id: number; x: number; y: number; hp: number; k: number; dn: number };

const players = (page: Page) => page.evaluate(() => ((window as any).__brawl.state()?.players ?? []) as P[]);
const myId = (page: Page) => page.evaluate(() => (window as any).__brawl.id as number);
const me = async (page: Page) => {
  const id = await myId(page);
  return (await players(page)).find((p) => p.id === id)!;
};
const find = async (page: Page, id: number) => (await players(page)).find((p) => p.id === id)!;
const dbg = (page: Page, op: string, extra: Record<string, number>) =>
  page.evaluate(([o, e]) => (window as any).__brawl.send({ t: 'dbg', op: o, ...(e as object) }), [op, extra] as const);

test('two players: move, shoot, KO', async ({ browser }) => {
  const room = 'e2e-' + Math.random().toString(36).slice(2, 8);
  const ctxA = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto('/?room=' + room + '&name=A');
  await b.goto('/?room=' + room + '&name=B');
  for (const pg of [a, b]) await expect.poll(() => pg.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  const idA = await myId(a);
  const idB = await myId(b);
  await expect.poll(async () => (await players(b)).length).toBe(2);
  // movement only applies in the playing phase (the countdown starts once both are in)
  await expect
    .poll(() => b.evaluate(() => (window as any).__brawl.state()?.m?.st), { timeout: 20_000 })
    .toBe('playing');

  // movement: A holds d, B sees A.x grow (open water: 900/1100 y=1000 sits inside a kelp bush)
  await dbg(a, 'tp', { x: 760, y: 760 });
  await dbg(b, 'tp', { x: 960, y: 760 });
  await expect.poll(async () => Math.round((await find(b, idA)).x)).toBe(760);
  const x0 = (await find(b, idA)).x;
  await a.keyboard.down('d');
  await a.waitForTimeout(600);
  await a.keyboard.up('d');
  await expect.poll(async () => (await find(b, idA)).x).toBeGreaterThan(x0 + 60);

  // line up: A 200 left of B, spawn shields expired, mouse to the right of centre
  const target = await me(b);
  await dbg(a, 'tp', { x: target.x - 200, y: target.y });
  await a.waitForTimeout(1700);
  await a.mouse.move(900, 350);
  for (let i = 0; i < 6; i++) {
    await a.mouse.down();
    await a.mouse.up();
    await a.waitForTimeout(300);
  }
  await expect.poll(async () => (await me(b)).hp).toBeLessThan(100);

  // finish B off
  await dbg(b, 'hp', { v: 1 });
  await a.waitForTimeout(1500);
  await a.mouse.down();
  await a.mouse.up();
  await expect.poll(async () => (await find(a, idA)).k).toBeGreaterThanOrEqual(1);
  expect((await find(a, idB)).dn).toBe(1);
  await ctxA.close();
  await ctxB.close();
});
