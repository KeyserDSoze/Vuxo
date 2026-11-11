import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { composeArguments, localProcessEnvironment, parseLocalEnv, renderLocalEnv, validateLocalEnv } from './dev-lib.mjs'

const template = readFileSync(new URL('../docker/local.env.example', import.meta.url), 'utf8')
const mockEntropy = bytes => Buffer.alloc(bytes, 0xaf)
const create = () => parseLocalEnv(renderLocalEnv(template, mockEntropy))

test('init builds private local configuration without committing or printing secrets', () => {
  const rendered = renderLocalEnv(template, mockEntropy)
  assert.doesNotMatch(rendered, /GENERATE_POSTGRES_PASSWORD|GENERATE_JWT_SIGNING_KEY/)
  const env = parseLocalEnv(rendered)
  assert.equal(env.VUXO_POSTGRES_PASSWORD.length, 64)
  assert.equal(env.VUXO_JWT_SIGNING_KEY.length, 96)
  assert.match(env.VUXO_POSTGRES_PASSWORD, /^[a-f0-9]+$/)
  assert.deepEqual(validateLocalEnv(env), [])
  assert.equal(env.VUXO_ALLOWED_ORIGIN, 'http://127.0.0.1:5173')
  assert.equal(env.VUXO_LLM_ENABLED, 'false')
})

test('template prevents missing secret markers and repeated keys', () => {
  assert.throws(() => renderLocalEnv('VUXO_POSTGRES_PASSWORD=GENERATE_POSTGRES_PASSWORD'), /missing or duplicates/)
  assert.throws(() => parseLocalEnv('VUXO_A=1\nVUXO_A=2'), /Duplicate/)
  assert.throws(() => parseLocalEnv('export VUXO_A=1'), /Invalid/)
})

test('reject insecure secrets, production origins, duplicate and invalid host ports', () => {
  const env = create()
  env.VUXO_JWT_SIGNING_KEY = 'CHANGE_ME'
  env.VUXO_ALLOWED_ORIGIN = 'https://vuxo.quest'
  env.VUXO_REDIS_DEV_PORT = env.VUXO_POSTGRES_DEV_PORT
  env.VUXO_API_DEV_PORT = '0'
  env.VUXO_POSTGRES_DEV_PORT = '65536'
  const errors = validateLocalEnv(env).join(' ')
  assert.match(errors, /VUXO_JWT_SIGNING_KEY/)
  assert.match(errors, /VUXO_ALLOWED_ORIGIN/)
  assert.match(errors, /VUXO_REDIS_DEV_PORT|VUXO_POSTGRES_DEV_PORT/)
  assert.match(errors, /VUXO_API_DEV_PORT/)
  assert.doesNotMatch(errors, /CHANGE_ME|https:\/\/vuxo.quest/)
})

test('custom frontend port requires a matching loopback CORS origin', () => {
  const env = create()
  env.VUXO_FRONTEND_DEV_PORT = '5199'
  assert.match(validateLocalEnv(env).join(' '), /VUXO_ALLOWED_ORIGIN/)
  env.VUXO_ALLOWED_ORIGIN = 'http://127.0.0.1:5199'
  assert.deepEqual(validateLocalEnv(env), [])
  env.VUXO_ALLOWED_ORIGIN = 'http://localhost:5199'
  assert.deepEqual(validateLocalEnv(env), [])
  env.VUXO_ALLOWED_ORIGIN = 'https://vuxo.quest'
  assert.match(validateLocalEnv(env).join(' '), /VUXO_ALLOWED_ORIGIN/)
})

test('Compose always uses isolated local project and env file; down preserves volumes', () => {
  const root = ['/tmp/docker/.env.local', '/tmp/docker/compose.dev.yml']
  const pre = ['compose', '--project-name', 'vuxo-dev', '--env-file', root[0], '-f', root[1]]
  assert.deepEqual(composeArguments(...root, 'check'), [...pre, 'config', '--quiet'])
  assert.deepEqual(composeArguments(...root, 'infra'), [...pre, 'up', '-d', 'postgres', 'redis'])
  assert.deepEqual(composeArguments(...root, 'infra', 'ollama'),
    [...pre, 'up', '-d', 'postgres', 'redis', 'ollama', 'ollama-model-init'])
  assert.deepEqual(composeArguments(...root, 'status'), [...pre, 'ps'])
  assert.deepEqual(composeArguments(...root, 'logs', 'postgres'), [...pre, 'logs', '--tail', '100', 'postgres'])
  const down = composeArguments(...root, 'down')
  assert.deepEqual(down, [...pre, 'down'])
  assert.equal(down.includes('-v'), false)
  assert.throws(() => composeArguments(...root, 'logs', '../secret'), /Unknown development service/)
  assert.throws(() => composeArguments(...root, 'deploy'), /Unsupported/)
})

test('Docker full app stack is explicitly selected and remains local/non-destructive', () => {
  const root = ['/tmp/docker/.env.local', '/tmp/docker/compose.dev.yml']
  const app = '/tmp/docker/compose.dev-app.yml'
  const prefix = ['compose', '--project-name', 'vuxo-dev', '--env-file', root[0],
    '-f', root[1], '-f', app]
  assert.deepEqual(composeArguments(...root, 'check', undefined, app), [...prefix, 'config', '--quiet'])
  assert.deepEqual(composeArguments(...root, 'infra', undefined, app),
    [...prefix, 'up', '-d', 'postgres', 'redis'])
  assert.deepEqual(composeArguments(...root, 'up', undefined, app),
    [...prefix, 'up', '-d', 'postgres', 'redis', 'api', 'frontend'])
  assert.deepEqual(composeArguments(...root, 'up', 'ollama', app),
    [...prefix, 'up', '-d', 'postgres', 'redis', 'api', 'frontend', 'ollama', 'ollama-model-init'])
  assert.deepEqual(composeArguments(...root, 'logs', 'frontend', app),
    [...prefix, 'logs', '--tail', '100', 'frontend'])
  assert.deepEqual(composeArguments(...root, 'down', undefined, app), [...prefix, 'down'])
  assert.equal(composeArguments(...root, 'down', undefined, app).includes('-v'), false)
})

test('process environment cannot silently override local secrets/ports via production VUXO_* values', () => {
  const local = create()
  const merged = localProcessEnvironment({
    PATH: '/safe', DOCKER_HOST: 'unix:///local/docker.sock',
    VUXO_POSTGRES_PASSWORD: 'production-private-secret',
    VUXO_ALLOWED_ORIGIN: 'https://vuxo.quest',
    VUXO_FRONTEND_DEV_PORT: '443',
    VUXO_CLOUDFLARE_TUNNEL_TOKEN: 'production-token',
  }, local)
  assert.equal(merged.VUXO_POSTGRES_PASSWORD, local.VUXO_POSTGRES_PASSWORD)
  assert.equal(merged.VUXO_ALLOWED_ORIGIN, local.VUXO_ALLOWED_ORIGIN)
  assert.equal(merged.VUXO_FRONTEND_DEV_PORT, '5173')
  assert.equal(merged.VUXO_CLOUDFLARE_TUNNEL_TOKEN, undefined)
  assert.equal(merged.PATH, '/safe')
})
