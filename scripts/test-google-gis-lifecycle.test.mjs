import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path => readFileSync(resolve(root, path), 'utf8');

test('Google singleton initializes only when the client ID changes', () => {
  const component = source('src/frontend/src/features/auth/GoogleSignInButton.tsx');
  assert.match(component, /let initializedGoogleClientId:\s*string \| null = null/);
  assert.match(component, /if \(initializedGoogleClientId !== clientId\)\s*\{\s*identity\.initialize\(/);
  assert.match(component, /initializedGoogleClientId = clientId/);
});

test('Google callback uses the latest component handlers and detaches on unmount', () => {
  const component = source('src/frontend/src/features/auth/GoogleSignInButton.tsx');
  assert.match(component, /onCredentialRef\.current = onCredential/);
  assert.match(component, /onErrorRef\.current = onError/);
  assert.match(component, /activeGoogleCredentialHandler\?\.\(response\)/);
  assert.match(component, /activeGoogleCredentialHandler === onGoogleResponse/);
  assert.match(component, /activeGoogleCredentialHandler = null/);
  assert.match(component, /\}, \[clientId, i18n\.resolvedLanguage\]\);/);
  assert.doesNotMatch(component, /\[clientId, i18n\.resolvedLanguage, onCredential, onError\]/);
});

test('production runbook matches Google quest origin and Microsoft consumer policy', () => {
  const guide = source('docs/operations/LOGIN-GOOGLE-MICROSOFT-STE100.md');
  assert.match(guide, /Authorized JavaScript origin[\s\S]*?https:\/\/vuxo\.quest/);
  assert.match(guide, /Personal Microsoft accounts only/);
  assert.match(guide, /VUXO_MICROSOFT_TENANT_ID\x60\s*\|\s*\x60consumers\x60/);
  assert.doesNotMatch(guide, /VUXO_MICROSOFT_TENANT_ID\x60\s*\|\s*\x60common\x60/);
});
