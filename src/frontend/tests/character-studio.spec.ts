import { expect, test } from '@playwright/test';

const catalog = {
  catalogVersion: '0.0.1',
  hairStyles: ['hair-1', 'hair-2', 'hair-3', 'hair-4'],
  hairColors: ['black', 'brown', 'blonde', 'red', 'blue'],
  faces: ['face-1', 'face-2', 'face-3'],
  bodyTypes: ['body-1', 'body-2', 'body-3'],
  skinTones: ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'],
  topColors: ['blue', 'red', 'green', 'black', 'white'],
  bottomStyles: ['shorts', 'skirt'],
  bottomColors: ['black', 'blue', 'red', 'green', 'white'],
  shoeStyles: ['shoe-1', 'shoe-2', 'shoe-3'],
  shoeColors: ['white', 'black', 'brown', 'red', 'blue'],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
  await page.route('**/api/meta/character-appearance', route => route.fulfill({ json: catalog }));
});

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [3440, 1440]] as const) {
  test(`character studio is a viewport-native game screen at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('./#/character');
    await expect(page.getByTestId('character-studio-hero')).toBeVisible();
    await expect(page.getByTestId('character-studio-portrait')).toBeVisible();
    await expect(page.getByTestId('character-preview')).toBeVisible();
    await expect(page.getByTestId('character-studio-budget')).toBeVisible();
    await expect(page.getByTestId('character-studio-nav')).toBeVisible();
    await expect(page.getByTestId('character-point-budget')).toContainText('10 / 10');
    await expect(page.getByTestId('character-try-look')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const html = document.documentElement;
      const deck = document.querySelector('[data-testid="game-deck"]')!.getBoundingClientRect();
      return html.scrollWidth <= html.clientWidth + 1
        && html.scrollHeight <= window.innerHeight + 1
        && deck.bottom <= window.innerHeight + 1
        && deck.top >= 0
        && document.scrollingElement!.scrollTop === 0;
    })).toBe(true);

    await page.getByTestId('character-step-appearance').click();
    await expect(page.getByTestId('character-studio-appearance')).toBeFocused();
    await expect(page.getByTestId('character-studio-appearance')).toBeInViewport({ ratio: 0.25 });
    await page.getByTestId('character-step-identity').click();
    await expect(page.getByTestId('character-studio-identity')).toBeFocused();

    if (width === 390 || width === 1280) {
      await page.getByTestId('game-deck-scroll').evaluate(el => { el.scrollTop = 0; });
      await info.attach(`character-studio-${width}x${height}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
  });
}

test('another look cycles valid server catalog options and persists draft without any POST', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() !== 'GET' && new URL(req.url()).pathname === '/api/characters') posts.push(req.url());
  });
  await page.goto('./#/character');
  await expect(page.getByTestId('hairStyle-select')).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('vuxo.character.draft') ?? 'null'));
  const pointsBefore = await page.getByTestId('character-point-budget').innerText();
  await page.getByTestId('character-try-look').click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('vuxo.character.draft') ?? 'null'));
  expect(after.appearance.hairStyle).not.toBe(before.appearance.hairStyle);
  expect(catalog.hairStyles).toContain(after.appearance.hairStyle);
  expect(catalog.hairColors).toContain(after.appearance.hairColor);
  expect(catalog.topColors).toContain(after.appearance.topColor);
  expect(catalog.bottomColors).toContain(after.appearance.bottomColor);
  expect(after.attributes).toEqual(before.attributes);
  expect(after.name).toBe(before.name);
  await expect(page.getByTestId('character-point-budget')).toHaveText(pointsBefore);
  expect(posts).toEqual([]);
  await page.reload();
  await expect(page.getByTestId('hairStyle-select').getByRole('combobox'))
    .toHaveText((await page.locator('[data-testid="hairStyle-select"] .MuiSelect-select').innerText()));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('vuxo.character.draft') ?? 'null')?.appearance?.hairStyle))
    .toBe(after.appearance.hairStyle);
  expect(posts).toEqual([]);
});

test('attribute overflow stays invalid after changing cosmetic look', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vuxo.accessToken', 'editor-test-token'));
  await page.goto('./#/character');
  await expect(page.getByTestId('character-point-budget')).toContainText('10 / 10');
  await page.getByRole('spinbutton', { name: 'Forza' }).fill('10');
  await expect(page.getByTestId('character-point-budget')).toContainText('18 / 10');
  await expect(page.getByTestId('character-studio-budget')).toContainText('8 punti oltre il limite');
  await expect(page.getByTestId('create-character')).toBeDisabled();
  await page.getByTestId('character-try-look').click();
  await expect(page.getByTestId('character-point-budget')).toContainText('18 / 10');
  await expect(page.getByTestId('create-character')).toBeDisabled();
});

test('English dark mobile navigation has keyboard focus and localized copy', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./#/character');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('character-step-identity')).toContainText('Identity and points');
  await expect(page.getByTestId('character-try-look')).toContainText('Try another look');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const button = page.getByTestId('character-step-appearance');
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('character-studio-appearance')).toBeFocused();
});

test('reduced-motion character studio keeps controls without hover animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/character');
  await expect(page.getByTestId('character-preview')).toBeVisible();
  await page.getByTestId('character-try-look').click();
  await expect(page.getByTestId('character-studio-portrait')).toBeVisible();
});
