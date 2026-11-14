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

test('production API defaults to loopback 64000 while dev and existing Linux deploy retain separate ports', () => {
  const productionCompose = source('docker/compose.prod.yml');
  const envExample = source('docker/.env.example');
  const developmentCompose = source('docker/compose.dev-app.yml');
  const serverWorkflow = source('.github/workflows/deploy-server.yml');
  const piWorkflow = source('.github/workflows/deploy-pi3.yml');

  assert.match(productionCompose, /127\.0\.0\.1:\$\{VUXO_API_PORT:-64000\}:8080/);
  assert.match(envExample, /^VUXO_API_PORT=64000$/m);
  assert.match(envExample, /^VUXO_MICROSOFT_TENANT_ID=consumers$/m);
  assert.match(developmentCompose, /VUXO_API_DEV_PORT:-8080/);
  assert.match(serverWorkflow, /^\s+VUXO_API_PORT=8080$/m);
  assert.match(serverWorkflow, /http:\/\/127\.0\.0\.1:8080\/health/);
  assert.match(piWorkflow, /stream\.write\("VUXO_API_PORT=8080\\n"\)/);
});

test('Docker build context excludes local workspace data', () => {
  assert.match(source('.dockerignore'), /^\.local\/$/m);
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
