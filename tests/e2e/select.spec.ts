/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

const myFighter = (page: Page) =>
  page.evaluate(() => {
    const b = (window as any).__brawl;
    const me = (b.state()?.players ?? []).find((p: { id: number }) => p.id === b.id);
    return me?.f as string | undefined;
  });

test('character select: pick Mira in the lobby, join as Mira', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('fighter-card-mira')).toBeVisible();
  await page.getByTestId('fighter-card-mira').click();
  await expect(page.getByTestId('fighter-card-mira')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('quick-play').click();
  await expect.poll(() => myFighter(page)).toBe('mira');
});

test('character select: the choice is remembered and shown again', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('fighter-card-sudsy').click();
  await page.reload();
  await expect(page.getByTestId('fighter-card-sudsy')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('fighter-card-voltbun')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('create-room').click();
  await expect.poll(() => myFighter(page)).toBe('sudsy');
});

test('in-game menu: change fighter, next respawn brings the new kit', async ({ page }) => {
  await page.goto('/?room=pick-' + Math.random().toString(36).slice(2, 8) + '&name=Picker');
  await expect.poll(() => myFighter(page)).toBeTruthy();
  await expect.poll(() => page.evaluate(() => (window as any).__brawl.connected)).toBe(true);

  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-pick-noodle').click();
  await page.getByTestId('menu-btn').click(); // close
  // still alive as the old fighter — the swap waits for the respawn
  expect(await myFighter(page)).not.toBe('noodle');

  // KO ourselves (ALLOW_DEBUG test server) → the respawn swaps in the picked kit
  await page.evaluate(() => (window as any).__brawl.send({ t: 'dbg', op: 'kill' }));
  await expect.poll(() => myFighter(page), { timeout: 20_000 }).toBe('noodle');
});

test('character select: faction tabs filter the grid, Random picks a card', async ({ page }) => {
  await page.goto('/');
  // "All" is the default, so the whole roster is on screen
  await expect(page.getByTestId('fighter-card-gloomoth')).toBeVisible();
  await page.getByTestId('ftab-saltwind').click();
  await expect(page.getByTestId('ftab-saltwind')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('fighter-card-lenny')).toBeVisible();
  await expect(page.getByTestId('fighter-card-voltbun')).toBeHidden();
  await page.getByTestId('ftab-all').click();
  await expect(page.getByTestId('fighter-card-voltbun')).toBeVisible();

  // the dice pick one real kit, remember it and jump the grid back to "All"
  await page.getByTestId('fighter-random').click();
  const picked = await page.evaluate(() => localStorage.getItem('brawl.fighter'));
  expect(picked).toBeTruthy();
  await expect(page.getByTestId(`fighter-card-${picked}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ftab-all')).toHaveAttribute('aria-selected', 'true');
});
