import { expect, test } from '@playwright/test';

const runes = ['sun', 'moon', 'star', 'wave'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

async function hitCurrentRune(page: import('@playwright/test').Page, round: number) {
  const target = await page.getByTestId('reflex-target').getAttribute('data-rune');
  expect(runes).toContain(target);
  await page.getByTestId('reflex-rune-' + target).click();
  if (round < 8) {
    await expect(page.getByTestId('reflex-progress')).toContainText(String(round + 1));
  }
}

test('anonymous Reflex training completes 8 rounds without game API, rewards or persisted score', async ({ page }) => {
  const gameCalls: string[] = [];
  const gameChunks: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/\/api\/(characters|inventory|equipment|portals|world|personal-content)\b/.test(pathname)) gameCalls.push(request.url());
    if (/\/assets\/GamePage-[^/]+\.js/.test(pathname)) gameChunks.push(request.url());
  });

  await page.goto('./#/refuge');
  await page.getByTestId('refuge-activity-reflex').click();
  await expect(page.getByTestId('reflex-training-page')).toBeVisible();
  await expect(page.getByTestId('reflex-disclaimer')).toContainText('nessuna ricompensa');
  await expect(page.getByTestId('reflex-result')).toHaveCount(0);
  await page.getByTestId('reflex-start').click();

  for (let round = 1; round <= 8; round++) {
    await hitCurrentRune(page, round);
  }
  await expect(page.getByTestId('reflex-result')).toBeVisible();
  await expect(page.getByTestId('reflex-hits')).toContainText('8 / 8');
  await expect(page.getByTestId('reflex-result-mistakes')).toContainText('0');
  await expect(page.getByTestId('reflex-average')).toContainText('ms');
  expect(gameCalls).toEqual([]);
  expect(gameChunks).toEqual([]);

  await page.getByTestId('reflex-again').click();
  await expect(page.getByTestId('reflex-progress')).toContainText('1 di 8');
  await page.getByTestId('reflex-back').click();
  await page.getByTestId('refuge-activity-reflex').click();
  await expect(page.getByTestId('reflex-ready')).toBeVisible();
  await expect(page.getByTestId('reflex-result')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('reflex')))).toEqual([]);
});

test('Rune reflexes counts incorrect taps but keeps target, and works in English dark mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./#/refuge/reflex');
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByRole('heading', { name: 'Rune reflexes' })).toBeVisible();
  await expect(page.getByTestId('reflex-disclaimer')).toContainText('no rewards');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.getByTestId('reflex-start').click();
  const target = await page.getByTestId('reflex-target').getAttribute('data-rune');
  const wrong = runes.find(rune => rune !== target)!;
  await page.getByTestId('reflex-rune-' + wrong).click();
  await expect(page.getByTestId('reflex-mistakes')).toContainText('1');
  await expect(page.getByTestId('reflex-target')).toHaveAttribute('data-rune', target!);
  await page.getByTestId('reflex-rune-' + target).click();
  await expect(page.getByTestId('reflex-progress')).toContainText('Round 2 of 8');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.reload();
  await expect(page.getByTestId('reflex-ready')).toBeVisible();
});
