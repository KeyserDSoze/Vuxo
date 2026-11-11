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
  // Each Playwright test gets an isolated browser context. Do not clear
  // storage on reload: the local character draft must survive navigation.
  await page.addInitScript(() => {
    if (!localStorage.getItem('vuxo.language')) localStorage.setItem('vuxo.language', 'it');
    if (!localStorage.getItem('vuxo.theme')) localStorage.setItem('vuxo.theme', 'system');
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
  const optionLabels: Record<string, string> = { 'hair-1': 'Corti', 'hair-2': 'Medi', 'hair-3': 'Lunghi', 'hair-4': 'Ricci' };
  await expect(page.getByTestId('hairStyle-select').getByRole('combobox'))
    .toHaveText(optionLabels[after.appearance.hairStyle]);
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

test('chamber view keeps portrait and saved draft when switching identity and appearance without POST', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: string[] = [];
  const reads: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/api/')) {
      if (request.method() === 'GET') reads.push(path);
      else if (request.method() !== 'OPTIONS') writes.push(request.method() + ':' + path);
    }
  });
  await page.goto('./#/character');
  await expect(page.getByTestId('character-studio-portrait')).toBeVisible();
  await expect(page.getByTestId('character-point-budget')).toContainText('10 / 10');
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Rune Vuxian');
  const readsBefore = reads.length;
  await page.getByTestId('character-focus-toggle').click();
  await expect(page.getByTestId('character-focus-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('character-studio-hero')).toBeHidden();
  await expect(page.getByTestId('character-step-identity')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('character-studio-identity')).toBeFocused();
  await expect(page.getByTestId('character-studio-appearance')).toBeHidden();
  await expect(page.getByTestId('character-studio-portrait')).toBeVisible();

  await page.getByTestId('character-step-appearance').click();
  await expect(page.getByTestId('character-studio-appearance')).toBeFocused();
  await expect(page.getByTestId('character-step-appearance')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('character-studio-identity')).toBeHidden();
  await expect(page.getByTestId('character-try-look')).toBeVisible();
  await page.getByTestId('hairStyle-select').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Lunghi' }).click();
  await page.getByTestId('character-step-identity').click();
  await expect(page.getByTestId('character-studio-identity')).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Rune Vuxian');
  await expect(page.getByTestId('character-point-budget')).toContainText('10 / 10');
  await page.getByTestId('character-step-appearance').click();
  await expect(page.getByTestId('hairStyle-select').getByRole('combobox')).toHaveText('Lunghi');
  expect(reads.length).toBe(readsBefore);
  expect(writes).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1
    && document.scrollingElement!.scrollTop === 0)).toBe(true);
  await info.attach('character-focused-appearance-390', { body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png' });
  await page.getByTestId('character-focus-toggle').click();
  await expect(page.getByTestId('character-focus-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('character-studio-hero')).toBeVisible();
  await expect(page.getByTestId('character-studio-identity')).toBeVisible();
  await expect(page.getByTestId('character-studio-appearance')).toBeVisible();
  expect(writes).toEqual([]);
});

test('English dark chamber keyboard controls and reduced motion fit 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/character');
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const toggle = page.getByTestId('character-focus-toggle');
  await expect(toggle).toHaveText('Chamber view');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveText('Full overview');
  const appearance = page.getByTestId('character-step-appearance');
  await appearance.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('character-studio-appearance')).toBeFocused();
  await expect(appearance).toHaveAttribute('aria-pressed', 'true');
  await expect(appearance).toHaveCSS('transition-duration', '0s');
  await expect(page.getByTestId('character-studio-portrait')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test('chamber view retains authoritative attribute validity and never submits a disabled invalid draft', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./#/character');
  await page.getByTestId('character-focus-toggle').click();
  await expect(page.getByTestId('character-studio-identity')).toBeFocused();
  await page.getByRole('spinbutton', { name: 'Forza' }).fill('10');
  await expect(page.getByTestId('character-point-budget')).toContainText('18 / 10');
  await expect(page.getByTestId('create-character')).toBeDisabled();
  await page.getByTestId('character-step-appearance').click();
  await expect(page.getByTestId('character-studio-identity')).toBeHidden();
  await expect(page.getByTestId('create-character')).toBeDisabled();
  await page.getByTestId('character-step-identity').click();
  await expect(page.getByTestId('character-point-budget')).toContainText('18 / 10');
  await expect(page.getByTestId('create-character')).toBeDisabled();
});

test('reduced-motion character studio keeps controls without hover animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/character');
  await expect(page.getByTestId('character-preview')).toBeVisible();
  await page.getByTestId('character-try-look').click();
  await expect(page.getByTestId('character-studio-portrait')).toBeVisible();
});

test('owner can edit only saved cosmetics with optimistic revision, not identity or stats', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vuxo.accessToken', 'studio-owner-token'));
  const savedLook = {
    hairStyle: 'hair-1', hairColor: 'black', face: 'face-1', bodyType: 'body-1',
    skinTone: 'skin-1', topColor: 'blue', bottomStyle: 'shorts', bottomColor: 'black',
    shoeStyle: 'shoe-1', shoeColor: 'white',
  };
  let sent: { catalogVersion: string; expectedRevision: number; appearance: typeof savedLook } | null = null;
  await page.route('**/api/characters/me/appearance', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: {
        name: 'Saved Vuxian',
        attributes: { strength: 2, dexterity: 2, intelligence: 2,
          constitution: 2, luck: 1, faith: 1 },
        appearance: savedLook, appearanceRevision: 7, catalogVersion: '0.0.1',
      } });
      return;
    }
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { catalogVersion: '0.0.1',
      appearanceRevision: 8, appearance: sent!.appearance, changed: true } });
  });
  await page.goto('./#/character');
  await expect(page.getByTestId('character-existing-note')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveValue('Saved Vuxian');
  await expect(page.getByRole('textbox', { name: 'Nome' })).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: 'Forza' })).toBeDisabled();
  await expect(page.getByTestId('create-character')).toContainText('Salva aspetto');
  await expect(page.getByTestId('create-character')).toBeDisabled();
  await page.getByTestId('character-try-look').click();
  await expect(page.getByTestId('create-character')).toBeEnabled();
  await page.getByTestId('create-character').click();
  await expect(page.getByText('Aspetto salvato sul server.', { exact: false })).toBeVisible();
  expect(sent).not.toBeNull();
  expect(sent!.catalogVersion).toBe('0.0.1');
  expect(sent!.expectedRevision).toBe(7);
  expect(sent!.appearance.hairStyle).toBe('hair-2');
  expect(Object.keys(sent!).sort()).toEqual(['appearance', 'catalogVersion', 'expectedRevision']);
  await expect(page.getByTestId('create-character')).toBeDisabled();
});

test('optimistic conflict never claims saved appearance and keeps local look for retry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vuxo.accessToken', 'studio-owner-token'));
  let patches = 0;
  await page.route('**/api/characters/me/appearance', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: {
        name: 'Saved Vuxian', appearanceRevision: 3, catalogVersion: '0.0.1',
        attributes: { strength: 2, dexterity: 2, intelligence: 2,
          constitution: 2, luck: 1, faith: 1 },
        appearance: {
          hairStyle: 'hair-1', hairColor: 'black', face: 'face-1', bodyType: 'body-1',
          skinTone: 'skin-1', topColor: 'blue', bottomStyle: 'shorts',
          bottomColor: 'black', shoeStyle: 'shoe-1', shoeColor: 'white',
        },
      } });
    } else {
      patches++;
      await route.fulfill({ status: 409, json: { code: 'character_appearance_revision_conflict' } });
    }
  });
  await page.goto('./#/character');
  await expect(page.getByTestId('character-existing-note')).toBeVisible();
  await page.getByTestId('character-try-look').click();
  await page.getByTestId('create-character').click();
  await expect(page.getByText('Il personaggio è stato modificato altrove.', { exact: false })).toBeVisible();
  expect(patches).toBe(1);
  await expect(page.getByTestId('create-character')).toBeEnabled();
  await expect(page.getByTestId('hairStyle-select').getByRole('combobox')).toContainText('Medi');
});
