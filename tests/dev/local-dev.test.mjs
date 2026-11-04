import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseEnv, generateLocalEnv, hostEnvironment, validateLocalEnv } from '../../scripts/dev-lib.mjs';

const example = readFileSync(new URL('../../docker/local.env.example', import.meta.url), 'utf8');
const valid = () => validateLocalEnv(parseEnv(generateLocalEnv(example, () => 'test-local-secret-1234567890-abcdefghijklmnopqrstuvwxyz')));

test('init produces valid isolated local secrets, never placeholder values', () => {
  const env = valid();
  assert.notEqual(env.VUXO_POSTGRES_PASSWORD, 'GENERATED_BY_INIT');
  assert.equal(env.VUXO_LLM_ENABLED, 'false');
  assert.equal(env.VUXO_OBSERVABILITY_ENABLED, 'false');
});

test('parses CRLF and quoted values equally on Windows and Linux', () => {
  assert.deepEqual(parseEnv('A="x"\r\n# note\r\nB=y\r\n'), { A: 'x', B: 'y' });
  assert.throws(() => parseEnv('INVALID LINE'), /Invalid environment line/);
});

test('port overrides propagate to API, CORS, test database, and frontend', () => {
  const env = valid();
  env.VUXO_API_PORT = '18081';
  env.VUXO_FRONTEND_PORT = '15173';
  env.VUXO_POSTGRES_DEV_PORT = '15432';
  validateLocalEnv(env);
  const host = hostEnvironment(env);
  assert.equal(host.ASPNETCORE_URLS, 'http://127.0.0.1:18081');
  assert.equal(host.VITE_API_BASE_URL, 'http://127.0.0.1:18081');
  assert.equal(host.Cors__AllowedOrigins__0, 'http://localhost:15173');
  assert.match(host.VUXO_TEST_POSTGRES_CONNECTION_STRING, /Port=15432/);
  assert.equal(host.VITE_HMR_CLIENT_PORT, '15173');
});

test('rejects port conflicts and invalid project names', () => {
  const env = valid();
  env.VUXO_REDIS_DEV_PORT = env.VUXO_API_PORT;
  assert.throws(() => validateLocalEnv(env), /conflicts/);
  env.VUXO_REDIS_DEV_PORT = '6379';
  env.VUXO_COMPOSE_PROJECT = '../production';
  assert.throws(() => validateLocalEnv(env), /PROJECT/);
});

test('isolates the Compose project from production even with environment overrides', () => {
  const env = valid();
  env.VUXO_COMPOSE_PROJECT = 'vuxo-local-alice';
  assert.equal(validateLocalEnv(env).VUXO_COMPOSE_PROJECT, 'vuxo-local-alice');
  for (const name of ['vuxo', 'production', 'vuxo-prod', 'vuxo_local']) {
    env.VUXO_COMPOSE_PROJECT = name;
    assert.throws(() => validateLocalEnv(env), /VUXO_COMPOSE_PROJECT/);
  }
});

test('rejects PostgreSQL connection-string and model pull command injection', () => {
  const env = valid();
  env.VUXO_POSTGRES_PASSWORD = 'safePassword1234;Host=malicious';
  assert.throws(() => validateLocalEnv(env), /VUXO_POSTGRES_PASSWORD/);
  env.VUXO_POSTGRES_PASSWORD = 'safePassword1234';
  env.VUXO_LLM_MODEL = 'qwen3:1.7b;echo-injection';
  assert.throws(() => validateLocalEnv(env), /VUXO_LLM_MODEL/);
  env.VUXO_LLM_MODEL = 'library/qwen3:1.7b';
  assert.equal(validateLocalEnv(env).VUXO_LLM_MODEL, 'library/qwen3:1.7b');
});

test('rejects weak local PostgreSQL and Grafana credentials', () => {
  const env = valid();
  env.VUXO_POSTGRES_PASSWORD = 'too-short';
  assert.throws(() => validateLocalEnv(env), /at least 16/);
  env.VUXO_POSTGRES_PASSWORD = 'safePassword1234';
  env.VUXO_GRAFANA_ADMIN_PASSWORD = 'weak';
  assert.throws(() => validateLocalEnv(env), /at least 16/);
});

test('rejects invalid JWT and missing or malformed toggles', () => {
  const env = valid();
  env.VUXO_JWT_SIGNING_KEY = 'short';
  assert.throws(() => validateLocalEnv(env), /at least 32/);
  env.VUXO_JWT_SIGNING_KEY = 'a'.repeat(48);
  env.VUXO_LLM_ENABLED = 'yes';
  assert.throws(() => validateLocalEnv(env), /true or false/);
});
