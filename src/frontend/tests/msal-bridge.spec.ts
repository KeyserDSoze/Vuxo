import { expect, test } from '@playwright/test';

test('MSAL v5 popup redirect bridge is emitted as a standalone Vite page', async ({ request }) => {
  const response = await request.get('./redirect.html');
  expect(response.status()).toBe(200);

  const html = await response.text();
  expect(html).toContain('<title>Vuxo Microsoft sign-in</title>');
  expect(html).not.toContain('id="root"');
  expect(html).not.toContain('/src/main.tsx');

  const script = html.match(/<script[^>]*src="([^"]+\.js)"[^>]*>/i);
  expect(script).not.toBeNull();
  expect(script?.[1]).toMatch(/^\/Vuxo\/assets\/.+\.js$/);

  const bridgeScript = await request.get(new URL(script![1], response.url()).toString());
  expect(bridgeScript.status()).toBe(200);
});
