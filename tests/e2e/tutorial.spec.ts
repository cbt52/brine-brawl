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

// backlog #34: a non-default mode adds its own fourth card; Bounty Brawl keeps three
test('Showdown shows a fourth mode tip, Bounty Brawl shows three', async ({ page, browser }) => {
  const room = 'tutm-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&name=Tutor&bots=1&mode=showdown`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  const tips = page.getByTestId('tutorial');
  await expect(tips).toBeVisible();
  await expect(tips.locator('li')).toHaveCount(4);
  await expect(tips.locator('li').last()).toContainText('Showdown ring');
  await page.getByTestId('tutorial-ok').click();
  await expect(tips).toHaveCount(0);

  // a fresh browser context (new localStorage) so the bounty card shows again
  const bounty = await browser.newContext();
  const bp = await bounty.newPage();
  await bp.goto(`/?room=${room}-b&name=Tutor&bots=1&mode=bounty`);
  await expect.poll(() => bp.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect(bp.getByTestId('tutorial').locator('li')).toHaveCount(3);
  await bounty.close();
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

// backlog #43 (review): a joiner with no arena of their own gets the room's deck tips, not the docks ones
test('a joiner to a galleon room sees the galleon heading and cannon tip', async ({ page, browser }) => {
  const room = 'tutg-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&name=Host&bots=1&arena=galleon`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await page.getByTestId('tutorial-ok').click();

  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(`/?room=${room}&name=Guest`);
  await expect.poll(() => gp.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  const tips = gp.getByTestId('tutorial');
  await expect(tips).toBeVisible();
  await expect(tips).toContainText('Welcome aboard the galleon');
  await expect(tips.locator('li').last()).toContainText('Deck cannons');
  await guest.close();
});
