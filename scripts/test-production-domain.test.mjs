import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = path => readFileSync(join(root, path), 'utf8');

test('GitHub Pages deployment uses definitive vuxo.quest custom domain', () => {
  const workflow = source('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /url:\s*https:\/\/vuxo\.quest/);
  assert.match(workflow, /VITE_BASE_PATH:\s*\//);
});

test('Raspberry and legacy x64 deployment pin the canonical browser origin', () => {
  for (const path of ['.github/workflows/deploy-pi3.yml', '.github/workflows/deploy-server.yml']) {
    const workflow = source(path);
    assert.match(workflow, /^\s+ALLOWED_ORIGIN: https:\/\/vuxo\.quest\s*$/m, path);
    assert.doesNotMatch(workflow, /ALLOWED_ORIGIN:\s*\$\{\{\s*vars\.VUXO_ALLOWED_ORIGIN/, path);
  }
});

test('Docker production Compose defaults and Pi preflight use quest, not app', () => {
  assert.match(source('docker/compose.prod.yml'), /Cors__AllowedOrigins__0:\s*\$\{VUXO_ALLOWED_ORIGIN:-https:\/\/vuxo\.quest\}/);
  assert.match(source('infra/pi3/verify-auth.py'), /entries\["VUXO_ALLOWED_ORIGIN"\]\s*!=\s*"https:\/\/vuxo\.quest"/);
});

test('Public API smoke probes the correct browser origin', () => {
  const script = source('scripts/verify-public-auth.mjs');
  assert.match(script, /const WEB\s*=\s*'https:\/\/vuxo\.quest'/);
  assert.match(script, /Access-Control-Request-Method/);
  assert.match(script, /\/redirect\.html/);
});

test('MSAL5 popup callback stays on the current frontend origin', () => {
  const msal = source('src/frontend/src/features/auth/microsoftAuth.ts');
  assert.match(msal, /new URL\(\x60\$\{import\.meta\.env\.BASE_URL\}redirect\.html\x60, window\.location\.origin\)/);
});
