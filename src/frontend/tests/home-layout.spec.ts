import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

for (const width of [320, 390, 768, 1280]) {
  test('home hero is readable and does not overflow at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./#/');

    const heading = page.getByRole('heading', { level: 1, name: /oltre il portale/i });
    await expect(heading).toBeVisible();
    await expect(page.getByTestId('home-highlights').getByRole('heading', { level: 3 })).toHaveCount(3);

    const bounds = await heading.boundingBox();
    expect(bounds).not.toBeNull();
    // Regression for maxWidth: 11 (11px); the title needs a real text column.
    expect(bounds!.width).toBeGreaterThan(180);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )).toBe(true);
  });
}

test('home remains legible in English with dark theme on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/');

  await page.getByTestId('language-toggle').click();
  await expect(page.getByRole('heading', { level: 1, name: /beyond the portal/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A shared world' })).toBeVisible();

  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )).toBe(true);
});
