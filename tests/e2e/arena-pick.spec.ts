/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

test('lobby deck pick: a created Galleon room plays on the galleon layout', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Deckhand');
  await page.getByTestId('arena-galleon').click();
  await expect(page.getByTestId('arena-hint')).toContainText('cannon lanes');
  await page.getByTestId('create-room').click();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.ar)).toBe('galleon');
});

test('lobby deck pick: the docks stay the default', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Deckhand');
  await page.getByTestId('create-room').click();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.state()?.m?.ar)).toBe('docks');
});
