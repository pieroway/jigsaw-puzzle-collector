import { test, expect } from '@playwright/test';

test('primary screens have no uncaught JavaScript errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Collection.' })).toBeVisible();
  await expect(page.getByRole('button',{name:'Add',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page.getByRole('form',{name:'Account login'})).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home.' })).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preferences.' })).toBeVisible();
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => (node as HTMLScriptElement).src));
  console.log('Application script URLs:', JSON.stringify(scripts));
  expect(scripts.some(url => /content\.bundle|content-script/.test(url))).toBe(false);
  expect(errors, 'Uncaught JavaScript errors in an extension-free browser').toEqual([]);
});
