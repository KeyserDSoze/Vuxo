import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = readFileSync(resolve(process.cwd(), '../../VERSION'), 'utf8').trim();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

test('version page shows frontend and backend build metadata', async ({ page }) => {
  await page.route('http://127.0.0.1:8080/api/meta/version', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      application: 'Vuxo',
      version,
      informationalVersion: `${version}+backend-test`,
      commit: 'backend-test',
      buildDateUtc: '2026-09-21T06:00:00Z',
      environment: 'Test'
    })
  }));

  await page.goto('./#/version');

  await expect(page.getByTestId('frontend-version')).toHaveText(version);
  await expect(page.getByTestId('backend-version')).toHaveText(version);
  await expect(page.getByTestId('backend-environment')).toHaveText('Test');
});

test('notifies when a newer frontend build appears', async ({ page }) => {
  let liveBuild = {
    version,
    commit: 'frontend-build-a',
    buildDateUtc: '2026-09-21T06:00:00Z'
  };

  await page.route('**/version.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(liveBuild)
  }));

  await page.goto('./#/');
  await expect(page.getByTestId('shell-version')).toContainText(version);

  liveBuild = {
    version,
    commit: 'frontend-build-b',
    buildDateUtc: '2026-09-21T07:00:00Z'
  };

  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.getByTestId('build-update-notice')).toBeVisible();
  await expect(page.getByTestId('build-update-notice')).toContainText('nuova build Vuxo');
  await expect(page.getByRole('button', { name: 'Ricarica' })).toBeVisible();
});
