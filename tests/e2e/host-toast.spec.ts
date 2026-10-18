/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

// backlog #45: when the host leaves, the next player gets the one-line toast and the ☰ bot controls unlock
test('the next player is told when they inherit the host role', async ({ page, browser }) => {
  const room = 'hostt-' + Math.random().toString(36).slice(2, 8);
  await page.goto(`/?room=${room}&name=Host&bots=0`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);

  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(`/?room=${room}&name=Guest&bots=0`);
  await expect.poll(() => gp.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  // the guest is not host yet, so no toast and the bot controls stay greyed out
  await expect(gp.getByTestId('host-toast')).toHaveCount(0);
  await gp.getByTestId('menu-btn').click();
  await expect(gp.getByTestId('menu-bot-plus')).toBeDisabled();
  await gp.getByTestId('menu-btn').click();

  // the host leaves: the server hands the role to the guest on the next snapshot
  await page.close();
  await expect(gp.getByTestId('host-toast')).toHaveText('You host this room now');
  await gp.getByTestId('menu-btn').click();
  await expect(gp.getByTestId('menu-bot-plus')).toBeEnabled();

  // the line clears on its own
  await expect(gp.getByTestId('host-toast')).toHaveCount(0, { timeout: 6000 });
  await guest.close();
});
