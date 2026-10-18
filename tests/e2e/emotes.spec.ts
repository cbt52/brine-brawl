import { test, expect } from '@playwright/test';

/**
 * Emote wheel (T99): the DOM wheel is the only client-side part that can be asserted from the
 * outside — the sticker bubble itself is drawn on the Phaser canvas. So: the fan opens/closes,
 * a pick sends (the wheel cools down for the server's EMOTE_COOLDOWN_MS) and keyboard 1–4 works.
 */
const joinFast = '/?room=emotes-e2e&name=Emoter&bots=2&fighter=mira';

// landscape on purpose: the portrait rotate hint (mobile project) covers the wheel otherwise
test.use({ viewport: { width: 915, height: 412 } });

test('emote wheel: opens, sends a sticker and cools down', async ({ page }) => {
  await page.goto(joinFast);
  const btn = page.getByTestId('emote-btn');
  await expect(btn).toBeVisible();
  const list = page.getByTestId('emote-list');
  await expect(list).toBeHidden();

  await btn.click();
  await expect(list).toBeVisible();
  for (const id of ['arr', 'bloop', 'gg', 'haha']) await expect(page.getByTestId(`emote-pick-${id}`)).toBeVisible();

  // a pick sends and closes the fan
  await page.getByTestId('emote-pick-bloop').click();
  await expect(list).toBeHidden();
  await expect(page.locator('#emote-wheel')).toHaveClass(/cool/);
  // the server enforces the same cooldown, so a second pick inside it must not fire
  await btn.click();
  await page.getByTestId('emote-pick-gg').click();

  // after the cooldown the wheel is usable again (keyboard path: press 1..4)
  await expect(page.locator('#emote-wheel')).not.toHaveClass(/cool/, { timeout: 3000 });
  await page.keyboard.press('1');
  await expect(page.locator('#emote-wheel')).toHaveClass(/cool/);
});

test('emote wheel: typing in the lobby is not stolen by the number keys', async ({ page }) => {
  await page.goto('/');
  const name = page.getByTestId('name-input');
  await name.fill('');
  await name.type('42');
  await expect(name).toHaveValue('42');
  await expect(page.locator('#emote-wheel')).not.toHaveClass(/cool/);
});
