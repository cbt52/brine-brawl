/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

test('quick play: lobby → canvas with 4 players', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('lobby')).toBeVisible();
  await page.getByTestId('name-input').fill('Tester');
  await page.getByTestId('quick-play').click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.players.length ?? 0)).toBeGreaterThanOrEqual(4);
  expect(await page.evaluate(() => (window as any).__brawl.room)).toMatch(/^qp-/);
});

test('create room: invite url, host bot controls', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-room').click();
  const url = await page.getByTestId('invite-url').inputValue();
  expect(url).toContain('?room=');
  await page.getByTestId('invite-close').click();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-bot-plus').click();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.players.length)).toBe(2);
});

test('lobby title stays on one line and fits the screen', async ({ page }) => {
  await page.goto('/');
  const title = page.locator('#lobby .title');
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  const fs = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(box.height).toBeLessThan(fs * 1.7); // one line, not wrapped
  expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('saved name: invite link still asks, with the name prefilled', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('brawl.name', 'Old Salt'));
  await page.goto('/?room=kelp-33');
  await expect(page.getByTestId('join-room')).toHaveText('kelp-33');
  await expect(page.getByTestId('name-input')).toHaveValue('Old Salt');
  await page.getByTestId('join-go').click();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.room)).toBe('kelp-33');
});

test('invite link shows join screen', async ({ page }) => {
  await page.goto('/?room=abc-12');
  await expect(page.getByTestId('join-room')).toHaveText('abc-12');
  await page.getByTestId('name-input').fill('Guest');
  await page.getByTestId('join-go').click();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.room)).toBe('abc-12');
});
