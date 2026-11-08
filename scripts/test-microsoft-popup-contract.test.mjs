import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(file) {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
}

test('MSAL initializes when the providers are loaded, before user interaction', () => {
  const page = source('../src/frontend/src/pages/AuthPage.tsx');
  const auth = source('../src/frontend/src/features/auth/microsoftAuth.ts');
  assert.match(page, /void prepareMicrosoftLogin\(\{/);
  assert.match(page, /setMicrosoftReady\(true\)/);
  assert.match(page, /disabled=\{providerBusy \|\| !microsoftReady\}/);
  assert.match(auth, /export function prepareMicrosoftLogin\(/);
  assert.match(auth, /entry\.initialization = application\.initialize\(\)/);
});

test('MSAL loginPopup runs synchronously before asynchronous token handling', () => {
  const auth = source('../src/frontend/src/features/auth/microsoftAuth.ts');
  const login = auth.slice(auth.indexOf('export function acquireMicrosoftIdToken('),
    auth.indexOf('export function getMicrosoftLoginErrorCode('));
  assert.ok(login.includes('return entry.application.loginPopup('));
  assert.doesNotMatch(login, /\bawait\b/);
  assert.match(auth, /navigatePopups: true/);
  assert.match(auth, /BrowserCacheLocation\.MemoryStorage/);
  assert.match(auth, /\}redirect\.html/);
});

test('Microsoft popup diagnostics have localized guidance without leaking tokens', () => {
  const auth = source('../src/frontend/src/features/auth/microsoftAuth.ts');
  const locales = source('../src/frontend/src/i18n.ts');
  assert.match(auth, /code === 'popup_window_error'/);
  assert.match(auth, /code === 'empty_window_error'/);
  assert.match(auth, /code === 'user_cancelled'/);
  assert.match(locales, /microsoft_popup_blocked: 'Il browser ha bloccato/);
  assert.match(locales, /microsoft_popup_blocked: 'Your browser blocked/);
});

test('Production Microsoft uses consumer accounts and a same-origin redirect bridge', () => {
  const guide = source('../docs/operations/LOGIN-GOOGLE-MICROSOFT-STE100.md');
  assert.match(guide, /Personal Microsoft accounts only/);
  assert.match(guide, /VUXO_MICROSOFT_TENANT_ID\x60\s*\|\s*\x60consumers\x60/);
  assert.match(guide, /https:\/\/vuxo\.quest\/redirect\.html/);
});

test('production deploys always select Microsoft consumer accounts', () => {
  for (const workflow of ['.github/workflows/deploy-pi3.yml', '.github/workflows/deploy-server.yml']) {
    const text = source('../' + workflow);
    assert.match(text, /^\s*MICROSOFT_TENANT_ID: consumers\s*$/m, workflow);
    assert.doesNotMatch(text, /MICROSOFT_TENANT_ID:\s*\$\{\{\s*vars\.VUXO_MICROSOFT_TENANT_ID/);
  }
  const compose = source('../docker/compose.prod.yml');
  assert.match(compose, /Auth__Microsoft__TenantId:\s*\$\{VUXO_MICROSOFT_TENANT_ID:-consumers\}/);
});
