import { expect, test } from '@playwright/test';
import { expectAttributeQuiet, expectJsonFieldsQuiet, expectNoRequestDuring, settledAttribute } from './support/vuxoFixtures';

// The quiet/settle helpers replace fixed sleeps, so they must be able to fail.
const markup = '<div id="avatar" data-x="1" data-art=\'{"near":1,"far":2}\'></div>';

test('expectJsonFieldsQuiet ignores unrelated fields but fails on a watched one', async ({ page }) => {
  await page.setContent(markup);
  await page.evaluate(() => setTimeout(() => document.getElementById('avatar')!.setAttribute('data-art', '{"near":9,"far":2}'), 40));
  await expectJsonFieldsQuiet(page, '#avatar', 'data-art', ['far'], 300);

  await page.evaluate(() => setTimeout(() => document.getElementById('avatar')!.setAttribute('data-art', '{"near":9,"far":3}'), 40));
  await expect(expectJsonFieldsQuiet(page, '#avatar', 'data-art', ['far'], 1_000)).rejects.toThrow(/must not change/);
});

test('expectNoRequestDuring fails on a request fired by the action and passes without one', async ({ page }) => {
  await page.route('**/probe', route => route.fulfill({ status: 204 }));
  await page.goto('about:blank');
  await expectNoRequestDuring(page, /\/probe$/, 150);

  await expect(expectNoRequestDuring(page, /\/probe$/, 1_000,
    () => page.evaluate(() => void fetch('http://127.0.0.1:4173/probe').catch(() => undefined)),
  )).rejects.toThrow(/no request matching/);
});

test('expectAttributeQuiet fails as soon as the attribute changes', async ({ page }) => {
  await page.setContent(markup);
  await page.evaluate(() => setTimeout(() => document.getElementById('avatar')!.setAttribute('data-x', '2'), 50));

  await expect(expectAttributeQuiet(page, '#avatar', 'data-x', 1_000)).rejects.toThrow(/must not change/);
});

test('expectAttributeQuiet notices a change on a re-mounted element', async ({ page }) => {
  await page.setContent(markup);
  await page.evaluate(() => setTimeout(() => {
    document.getElementById('avatar')!.replaceWith(Object.assign(document.createElement('div'), { id: 'avatar' }));
    document.getElementById('avatar')!.setAttribute('data-x', '3');
  }, 50));

  await expect(expectAttributeQuiet(page, '#avatar', 'data-x', 1_000)).rejects.toThrow(/must not change/);
});

test('expectAttributeQuiet passes when nothing changes', async ({ page }) => {
  await page.setContent(markup);

  await expectAttributeQuiet(page, '#avatar', 'data-x', 150);
});

test('settledAttribute waits for the last change before resolving', async ({ page }) => {
  await page.setContent(markup);
  await page.evaluate(() => {
    let step = 1;
    const timer = setInterval(() => {
      document.getElementById('avatar')!.setAttribute('data-x', String(++step));
      if (step === 5) clearInterval(timer);
    }, 40);
  });

  expect(await settledAttribute(page, '#avatar', 'data-x', 200)).toBe('5');
});
