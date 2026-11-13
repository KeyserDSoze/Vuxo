import { expect, test } from '@playwright/test';
import { expectNoDocumentScroll } from './support/vuxoFixtures';

test('credits list the third-party packs in Italian and English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vuxo.language', 'it'));
  await page.goto('./#/credits');
  const page_ = page.getByTestId('credits-page');
  await expect(page_).toBeVisible();
  const kenney = page.getByTestId('credit-kenney-rpg-pack');
  await expect(kenney).toContainText('Kenney');
  await expect(kenney).toContainText('CC0-1.0');
  await expect(kenney.getByRole('link', { name: 'Fonte' })).toHaveAttribute('href', 'https://kenney.nl/assets/rpg-base-pack');
  await expect(kenney.getByRole('link', { name: /CC0-1\.0/ })).toHaveAttribute('rel', /noopener/);
  await page.getByTestId('language-toggle').click();
  await expect(kenney.getByRole('link', { name: 'Source' })).toBeVisible();
  await expect(page_.getByRole('heading', { name: 'Credits and licenses' })).toBeVisible();
});

test('credits are reachable from the version page and fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./#/version');
  await page.getByTestId('credits-link').click();
  await expect(page.getByTestId('credits-page')).toBeVisible();
  await expectNoDocumentScroll(page);
});

test('the sound toggle persists the preference and never blocks the shell', async ({ page }) => {
  await page.goto('./#/');
  const toggle = page.getByTestId('sound-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.audio'))).toBe('off');
  await page.reload();
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('sound-toggle').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.audio'))).toBe('on');
});

test('missing sound files degrade to silence without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/assets/third-party/kenney-rpg-pack/audio/**', route => route.abort());
  await page.goto('./#/');
  await page.getByTestId('sound-toggle').click();
  await page.getByTestId('sound-toggle').click();
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  expect(errors).toEqual([]);
});
