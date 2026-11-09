import { expect, test } from '@playwright/test';

const catalog = {
  catalogVersion: 'offworld-activities-v1',
  activities: [
    { key: 'rune-memory', rulesVersion: 'rune-memory-local-v1', kind: 'memory',
      verification: 'local-practice', availability: 'available',
      practiceUnits: 4, rewardsEnabled: false, progressionEnabled: false },
    { key: 'rune-reflex', rulesVersion: 'rune-reflex-local-v1', kind: 'reflex',
      verification: 'local-practice', availability: 'available',
      practiceUnits: 8, rewardsEnabled: false, progressionEnabled: false },
    { key: 'rune-path', rulesVersion: 'rune-path-practice-v1', kind: 'logic',
      verification: 'local-practice', availability: 'available',
      practiceUnits: 3, rewardsEnabled: false, progressionEnabled: false },
    { key: 'crafting', rulesVersion: 'crafting-design-v1', kind: 'crafting',
      verification: 'local-practice', availability: 'planned',
      practiceUnits: 0, rewardsEnabled: false, progressionEnabled: false },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

test('guest opens the public catalog only on request and sees available local practices without rewards', async ({ page }) => {
  const requests: { method: string; authorization: string | undefined }[] = [];
  const chunks: string[] = [];
  page.on('request', request => {
    if (/\/assets\/GamePage-[^/]+\.js/.test(new URL(request.url()).pathname)) chunks.push(request.url());
  });
  await page.route('**/api/activities/catalog', route => {
    requests.push({
      method: route.request().method(),
      authorization: route.request().headers()['authorization'],
    });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) });
  });

  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  await expect(page.getByTestId('refuge-catalog-list')).toHaveCount(0);
  expect(requests).toEqual([]);

  await page.getByTestId('refuge-catalog-toggle').click();
  await expect(page.getByTestId('refuge-catalog-list')).toBeVisible();
  await expect(page.getByTestId('refuge-catalog-list').getByRole('heading', { level: 3 }))
    .toHaveCount(4);
  await expect(page.getByTestId('refuge-catalog-policy')).toContainText('Non concedono XP');
  await expect(page.getByTestId('refuge-catalog-rune-memory')).toContainText('Giocabile');
  await expect(page.getByTestId('refuge-catalog-rune-reflex')).toContainText('Giocabile');
  await expect(page.getByTestId('refuge-catalog-rune-path')).toContainText('Giocabile');
  await expect(page.getByTestId('refuge-catalog-crafting')).toContainText('In progettazione');
  await expect(page.getByTestId('refuge-catalog-crafting').getByRole('link')).toHaveCount(0);
  await expect(page.getByTestId('refuge-catalog-play-rune-memory')).toHaveAttribute('href', '#/refuge/training');
  await expect(page.getByTestId('refuge-catalog-play-rune-reflex')).toHaveAttribute('href', '#/refuge/reflex');
  await expect(page.getByTestId('refuge-catalog-play-rune-path')).toHaveAttribute('href', '#/refuge/path');
  expect(requests).toEqual([{ method: 'GET', authorization: undefined }]);

  await page.getByTestId('refuge-catalog-play-rune-path').click();
  await expect(page).toHaveURL(/#\/refuge\/path$/);
  await expect(page.getByTestId('rune-path-page')).toBeVisible();
  expect(chunks).toEqual([]);
});

test('API failure is isolated from existing refuge activities, retry works on English dark 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  let attempts = 0;
  await page.route('**/api/activities/catalog', route => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 503, body: 'unavailable' })
      : route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) });
  });
  await page.goto('./#/refuge');
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.getByTestId('refuge-catalog-toggle').click();
  await expect(page.getByTestId('refuge-catalog-error')).toContainText('Local practice is still accessible');
  await expect(page.getByTestId('refuge-activity-path')).toHaveAttribute('href', '#/refuge/path');
  await expect(page.getByTestId('refuge-activity-reflex')).toHaveAttribute('href', '#/refuge/reflex');
  await page.getByTestId('refuge-catalog-retry').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('refuge-catalog-list')).toBeVisible();
  await expect(page.getByTestId('refuge-catalog-crafting')).toContainText('Planned');
  await expect(page.getByTestId('refuge-catalog-policy')).toContainText('no XP, items or rewards');
  expect(attempts).toBe(2);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('a server response claiming client-owned rewards or progression fails closed', async ({ page }) => {
  let unsafe = true;
  await page.route('**/api/activities/catalog', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(unsafe
      ? { ...catalog, activities: catalog.activities.map(activity =>
          activity.key === 'rune-path' ? { ...activity, rewardsEnabled: true } : activity) }
      : catalog),
  }));
  await page.goto('./#/refuge');
  await page.getByTestId('refuge-catalog-toggle').click();
  await expect(page.getByTestId('refuge-catalog-error')).toBeVisible();
  await expect(page.getByTestId('refuge-catalog-list')).toHaveCount(0);
  unsafe = false;
  await page.getByTestId('refuge-catalog-retry').click();
  await expect(page.getByTestId('refuge-catalog-list')).toBeVisible();
  await expect(page.getByTestId('refuge-catalog-policy')).toContainText('Non concedono XP');
});

test('an unknown catalog rules version never creates playable or rewarded entries', async ({ page }) => {
  await page.route('**/api/activities/catalog', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ...catalog, catalogVersion: 'offworld-activities-v999' }),
  }));
  await page.goto('./#/refuge');
  await page.getByTestId('refuge-catalog-toggle').click();
  await expect(page.getByTestId('refuge-catalog-error')).toBeVisible();
  await expect(page.getByTestId('refuge-catalog-list')).toHaveCount(0);
  await page.getByTestId('refuge-catalog-toggle').click();
  await expect(page.getByTestId('refuge-catalog-policy')).toHaveCount(0);
  await expect(page.getByTestId('refuge-activity-training')).toHaveAttribute('href', '#/refuge/training');
});
