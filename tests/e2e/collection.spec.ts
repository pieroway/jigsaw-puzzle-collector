import { test, expect } from '@playwright/test';

test('rapid reduced-motion return restores focus consistently', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.setViewportSize({ width:390,height:650 });
  for(let attempt=0;attempt<8;attempt++) {
    await page.goto('/');
    await page.getByRole('button',{ name:'Nature',exact:true }).click();
    const card=page.locator('.puzzle-card').last();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
  }
});
test('gallery opens details and returns', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Collection.' })).toBeVisible();
  await page.getByRole('button', { name: /Alpine Village/ }).click();
  await expect(page.getByRole('heading', { name: 'Alpine Village' })).toBeVisible();
  await page.locator('.back-button').click();
  await expect(page.getByRole('heading', { name: 'My Collection.' })).toBeVisible();
});

test('themes follow the system and persist manual overrides', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Profile', exact: true }).first().click();
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Light', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('system reduced motion and explicit overrides remove spatial movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  const card = page.locator('.puzzle-card').first();
  await card.hover();
  await expect(card).toHaveCSS('transform', 'none');
  await card.click();
  await expect(page.locator('.flight')).toHaveCount(0);
  await expect(page.locator('.detail-scroll')).toHaveCSS('animation-duration', '0.12s');
  await expect(page.locator('.back-button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  await page.getByRole('button', { name: 'Profile', exact: true }).first().click();
  await page.getByRole('group', { name: 'Reduce Motion' }).getByRole('button', { name: 'Off', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('group', { name: 'Reduce Motion' }).getByRole('button', { name: 'On', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
});

test('Relaxed animation returns to the original card and preserves search', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search your collection' }).fill('Alpine');
  const card = page.locator('.puzzle-card').first();
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.flight')).toHaveCSS('--flight-duration', '550ms');
  await expect(page.locator('.flight')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.flight')).toHaveCSS('--flight-duration', '429ms');
  await expect(page.locator('.flight')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Search your collection' })).toHaveValue('Alpine');
  await expect(page.locator('.puzzle-card')).toHaveCount(1);
});

test('mobile gallery has two columns, list mode, and same-origin API', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.bottom-nav')).toBeVisible();
  expect(await page.locator('.puzzle-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  expect(await page.locator('.puzzle-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', service: 'jigsaw-api' });
});

test('returning from details preserves gallery scroll and category', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nature', exact: true }).click();
  const card = page.locator('.puzzle-card').last();
  await card.scrollIntoViewIfNeeded();
  const before = await page.locator('.scroll-area').first().evaluate(el => el.scrollTop);
  await card.click();
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  expect(await page.locator('.scroll-area').first().evaluate(el => el.scrollTop)).toBe(before);
  await expect(page.getByRole('button', { name: 'Nature', exact: true })).toHaveClass(/active/);
  await expect(page.locator('.puzzle-card')).toHaveCount(2);
});
test('reduced motion setting is available', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile', exact: true }).first().click();
  await page.getByRole('group', { name: 'Reduce Motion' }).getByRole('button', { name: 'On' }).click();
  await expect(page.getByText('Currently: Reduced motion')).toBeVisible();
});
