/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

// backlog #7: the tips show once per browser, are dismissible, and never block the arena
test('first visit shows the tips, "Got it" saves it, the next visit does not', async ({ page }) => {
  const room = 'tut-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&name=Tutor&bots=1`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  const tips = page.getByTestId('tutorial');
  await expect(tips).toBeVisible();
  await expect(tips.locator('li')).toHaveCount(3);

  // only the button takes pointer input; the rest of the card lets taps reach the arena
  const hit = await page.evaluate(() => {
    const el = document.getElementById('tutorial')!;
    return getComputedStyle(el).pointerEvents;
  });
  expect(hit).toBe('none');

  await page.getByTestId('tutorial-ok').click();
  await expect(tips).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('brawl.tutorial'))).toBe('seen');

  await page.goto(`/?room=${room}-2&name=Tutor&bots=1`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect(page.getByTestId('menu-btn')).toBeVisible();
  await expect(tips).toHaveCount(0);
});

// backlog #21: a player who already dismissed the tips can bring them back from the menu
test('menu "How to play" reopens the tips after they were seen', async ({ page }) => {
  const room = 'tuth-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&name=Tutor&bots=1`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await page.getByTestId('tutorial-ok').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);

  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-howto').click();
  const tips = page.getByTestId('tutorial');
  await expect(tips).toBeVisible();
  await expect(tips.locator('li')).toHaveCount(3);
  await expect(page.getByTestId('menu')).toBeHidden();

  await page.getByTestId('tutorial-ok').click();
  await expect(tips).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('brawl.tutorial'))).toBe('seen');
});
