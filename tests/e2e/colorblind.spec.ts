/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

// backlog #22: the ☰ menu switches the element colours to the colour-blind set and remembers it
test('menu "Colour-blind" toggles the choice and keeps it after a reload', async ({ page }) => {
  const room = 'cb-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&name=Cb&bots=1`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await page.getByTestId('tutorial-ok').click();

  await page.getByTestId('menu-btn').click();
  const cb = page.getByTestId('menu-cb');
  await expect(cb).toHaveText('Colour-blind: Off');
  await cb.click();
  await expect(cb).toHaveText('Colour-blind: On');
  expect(await page.evaluate(() => localStorage.getItem('brawl.cb'))).toBe('on');

  await page.reload();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await page.getByTestId('menu-btn').click();
  await expect(page.getByTestId('menu-cb')).toHaveText('Colour-blind: On');
});
