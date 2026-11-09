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
    await expect(page.getByTestId('home-highlights').getByRole('button')).toHaveCount(3);

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
  await expect(page.getByTestId('home-realm-world').getByText('A shared world')).toBeVisible();

  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )).toBe(true);
});


for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [3440, 1440]] as const) {
  test('the home game menu fits the viewport at ' + width + 'x' + height, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./#/');
    const screen = page.getByTestId('home-screen');
    await expect(screen).toBeVisible();
    await expect(page.getByTestId('home-portal')).toBeVisible();
    await expect(page.getByTestId('home-primary-cta')).toBeVisible();
    await expect(page.getByTestId('home-highlights').getByRole('button')).toHaveCount(3);
    await expect(page.getByTestId('home-path-link')).toBeVisible();

    await expect.poll(() => page.evaluate(() => {
      const root = document.documentElement;
      const screen = document.querySelector('[data-testid="home-screen"]')!;
      const selector = document.querySelector('[data-testid="home-highlights"]')!;
      const bounds = selector.getBoundingClientRect();
      return root.scrollWidth <= root.clientWidth + 1 &&
        root.scrollHeight <= window.innerHeight + 1 &&
        Math.abs(screen.getBoundingClientRect().bottom - window.innerHeight) <= 2 &&
        bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1;
    })).toBe(true);
  });
}

test('the optional rune sample scrolls inside home without scrolling the browser document', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/');
  await page.getByTestId('home-portal').click();
  await expect(page.getByTestId('home-rune-teaser')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollHeight <= window.innerHeight + 1
  )).toBe(true);
  await page.getByTestId('home-rune-start').click();
  for (const rune of ['sun', 'star', 'wave'] as const) {
    await page.getByTestId('home-rune-choice-' + rune).click();
  }
  await expect(page.getByTestId('home-rune-success')).toBeVisible();
  await page.getByTestId('home-realm-character').click();
  await expect(page.getByTestId('home-rune-teaser')).toHaveCount(0);
});
