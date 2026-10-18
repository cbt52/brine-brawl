/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

const phase = (page: Page) => page.evaluate(() => (window as any).__brawl.state()?.m?.st as string | undefined);

test('match flow: countdown → playing → results overlay → auto rematch', async ({ page }) => {
  const room = 'mt-' + Math.random().toString(36).slice(2, 7);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?room=${room}&name=A&bots=1&matchsec=8`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);

  await expect.poll(() => phase(page)).toBe('countdown');
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('playing');

  // results overlay with a ranking row
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('results-title')).toContainText(/wins/i);
  await expect(page.getByTestId('results-list').locator('li')).toHaveCount(2);

  // auto rematch: overlay disappears and a fresh countdown starts
  await expect(page.getByTestId('results')).toBeHidden({ timeout: 12000 });
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('countdown');
  expect(errors).toEqual([]);
});

test('scoreboard button opens and closes the in-game board', async ({ page }) => {
  const room = 'sb-' + Math.random().toString(36).slice(2, 7);
  await page.goto(`/?room=${room}&name=B&bots=2&matchsec=30`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  const btn = page.getByTestId('scoreboard-btn');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveClass(/on/);
  await btn.click();
  await expect(btn).not.toHaveClass(/on/);
});

test('a lone player waits for opponents', async ({ page }) => {
  const room = 'wait-' + Math.random().toString(36).slice(2, 7);
  await page.goto(`/?room=${room}&name=Solo&bots=0`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await page.waitForTimeout(1200);
  expect(await phase(page)).toBe('waiting');
  expect(await page.evaluate(() => (window as any).__brawl.state()?.m?.t)).toBe(0);
});

test('results screen: Rematch starts the next round and Change fighter opens the picker', async ({ page }) => {
  const room = 'rm-' + Math.random().toString(36).slice(2, 7);
  await page.goto(`/?room=${room}&name=R&bots=1&matchsec=5`);
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);
  await expect.poll(() => phase(page), { timeout: 10000 }).toBe('playing');
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 15000 });

  // "Change fighter" dismisses this round's poster and opens the in-game menu with the fighter row
  await page.getByTestId('results-fighter').click();
  await expect(page.getByTestId('results')).toBeHidden();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.locator('[data-testid=menu-fighters] button').first()).toBeVisible();
  // …and the poster does not pop back while the phase is still 'results'
  await page.waitForTimeout(400);
  await expect(page.getByTestId('results')).toBeHidden();
  await page.getByTestId('menu-btn').click(); // close it again so the next poster is clickable
  await expect(page.getByTestId('menu')).toBeHidden();

  // "Rematch" needs the poster, so wait for the next round's results and skip the wait
  await expect.poll(() => phase(page), { timeout: 12000 }).toBe('countdown');
  await expect.poll(() => phase(page), { timeout: 10000 }).toBe('playing');
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 15000 });
  // backlog #15: a Ready tap is final for the round and restarts 10 s after the last human's tap
  await expect(page.getByTestId('results-next')).toContainText(/Next round in \d+s/);
  await page.getByTestId('results-rematch').click();
  await expect(page.getByTestId('results-rematch')).toBeDisabled();
  await expect(page.getByTestId('results-rematch')).toContainText('Ready');
  await expect.poll(() => phase(page), { timeout: 12000 }).toBe('countdown');
  await expect(page.getByTestId('results')).toBeHidden();
});
