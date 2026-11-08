import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`capture mobile gallery and details in ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({ path: `artifacts/gallery-${theme}.png` });
    await page.getByRole('button', { name: /Alpine Village/ }).click();
    await expect(page.getByRole('heading', { name: 'Alpine Village' })).toBeVisible();
    await expect(page.locator('.detail-scroll')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `artifacts/details-${theme}.png` });
  });
}
