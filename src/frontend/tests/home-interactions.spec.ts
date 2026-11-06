import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
  await page.goto('./#/');
});

test('portal awakens and quiets using mouse and keyboard', async ({ page }) => {
  const portal = page.getByTestId('home-portal');
  const hero = page.getByTestId('home-hero');
  await expect(portal).toHaveAttribute('aria-pressed', 'false');
  await expect(hero).toHaveAttribute('data-awake', 'false');
  await portal.click();
  await expect(portal).toHaveAttribute('aria-pressed', 'true');
  await expect(hero).toHaveAttribute('data-awake', 'true');
  await expect(page.getByText(/Il portale risplende/i)).toBeVisible();

  await portal.focus();
  await page.keyboard.press('Space');
  await expect(portal).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(/Tocca il portale/i)).toBeVisible();
});

test('preview selection changes portal scene, copy and destination without changing gameplay', async ({ page }) => {
  const hero = page.getByTestId('home-hero');
  await expect(hero).toHaveAttribute('data-realm', 'world');
  await expect(page.getByTestId('home-realm-world')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('home-path-link')).toHaveAttribute('href', '#/auth');

  await page.getByTestId('home-realm-character').click();
  await expect(hero).toHaveAttribute('data-realm', 'character');
  await expect(page.getByTestId('home-realm-character')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('home-selected-path')).toContainText('Dai forma');
  await expect(page.getByTestId('home-path-link')).toHaveAttribute('href', '#/character');

  await page.getByTestId('home-portal').click();
  await expect(hero).toHaveAttribute('data-awake', 'true');
  await page.getByTestId('home-realm-portals').click();
  await expect(hero).toHaveAttribute('data-realm', 'portals');
  await expect(hero).toHaveAttribute('data-awake', 'false');
  await expect(page.getByTestId('home-path-link')).toHaveAttribute('href', '#/portals');
  await expect(page.getByTestId('home-selected-path')).toContainText('Ogni soglia');
});

test('realm selectors work with keyboard and retain visible focus', async ({ page }) => {
  const character = page.getByTestId('home-realm-character');
  await character.focus();
  await page.keyboard.press('Enter');
  await expect(character).toHaveAttribute('aria-pressed', 'true');
  await expect(character).toBeFocused();
  await expect(character).toHaveCSS('outline-style', 'solid');
});

test('mouse moves the scenery with subtle parallax and resets on exit', async ({ page }) => {
  const hero = page.getByTestId('home-hero');
  await hero.hover({ position: { x: 25, y: 40 } });
  await expect.poll(() => hero.evaluate(el => el.style.getPropertyValue('--landing-shift-x'))).not.toBe('0px');
  await page.mouse.move(0, 0);
  await expect.poll(() => hero.evaluate(el => el.style.getPropertyValue('--landing-shift-x'))).toBe('0px');
});

test('reduced motion keeps the portal interactive without pointer parallax', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const hero = page.getByTestId('home-hero');
  await hero.hover({ position: { x: 25, y: 40 } });
  await expect(hero).toHaveCSS('--landing-shift-x', '0px');
  const star = page.locator('.vuxo-landing__star').first();
  await expect(star).toHaveCSS('animation-name', 'none');
  await page.getByTestId('home-portal').click();
  await expect(hero).toHaveAttribute('data-awake', 'true');
});

test('English translation updates portal copy and path descriptions without refresh', async ({ page }) => {
  await page.getByTestId('language-toggle').click();
  await expect(page.getByRole('heading', { level: 1, name: /beyond the portal/i })).toBeVisible();
  await page.getByTestId('home-realm-character').click();
  await expect(page.getByTestId('home-selected-path')).toContainText('Shape the hero');
  await page.getByTestId('home-portal').click();
  await expect(page.getByText(/portal is glowing/i)).toBeVisible();
});

test('landing CTA keeps guest auth and refuge navigation intact', async ({ page }) => {
  await expect(page.getByTestId('home-primary-cta')).toHaveAttribute('href', '#/auth');
  await expect(page.getByTestId('home-refuge-link')).toHaveAttribute('href', '#/refuge');
  await page.getByTestId('home-refuge-link').click();
  await expect(page).toHaveURL(/#\/refuge$/);
});
