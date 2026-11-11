import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeArguments, developmentFlags, isLocalDockerEndpoint, localOtelHealthEndpoint, localProcessEnvironment, localDockerIdentity, prepareHostDependencyMount, localHostEnvironment, classifyHostDebugFailure, classifyHostDebugStage, parseLocalEnv, renderLocalEnv, validateLocalEnv, hostRuntimeEnvironment, hostCommandArguments, localHttpEndpoints, waitForLocalHttp } from './dev-lib.mjs'

const template = readFileSync(new URL('../docker/local.env.example', import.meta.url), 'utf8')

test('superseded main/PR workflows are cancelled only within each gate, not production deploys', () => {
  const workflows = [
    ['ci.yml', 'vuxo-ci-'],
    ['portal-live-e2e.yml', 'vuxo-portal-live-'],
    ['ux-visual-review.yml', 'vuxo-visual-'],
  ]
  const groups = new Set()
  for (const [filename, group] of workflows) {
    const source = readFileSync(new URL('../.github/workflows/' + filename, import.meta.url), 'utf8')
    assert.match(source, /(^|\n)concurrency:\n  group: /)
    assert.ok(source.includes('  group: ' + group + '${{ github.ref }}'))
    assert.match(source, /\n  cancel-in-progress: true\n/)
    assert.ok(!groups.has(group), 'independent gates must not cancel one another')
    groups.add(group)
    assert.ok(source.indexOf('\nconcurrency:\n') < source.indexOf('\njobs:\n'),
      'workflow-level concurrency must apply to every job')
  }
  const pages = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')
  assert.match(pages, /group: pages\n  cancel-in-progress: true/)
  const pi = readFileSync(new URL('../.github/workflows/deploy-pi3.yml', import.meta.url), 'utf8')
  assert.match(pi, /group: vuxo-pi3-production\n  cancel-in-progress: false/)
  assert.doesNotMatch(pi, /cancel-in-progress: true/)
  // The ARM64 build follows a completed *successful* CI; a superseded or
  // cancelled commit must never be promoted as a release.
  assert.match(pi, /github\.event\.workflow_run\.conclusion == 'success'/)
})

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
    '-f', root[1], '-f', app, '--profile', 'observability']
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

test('local OpenTelemetry opt-in preserves no-observability default and supports flag composition', () => {
  const env = create()
  assert.equal(hostRuntimeEnvironment(env).api.Observability__Enabled, 'false')
  assert.equal(hostRuntimeEnvironment(env).api.Observability__OtlpEndpoint, 'http://127.0.0.1:54317')
  assert.deepEqual(developmentFlags('up', ['--observability', '--ollama']),
    { ollama: true, observability: true })
  assert.deepEqual(developmentFlags('debug', ['--ollama', '--observability']),
    { ollama: true, observability: true })
  assert.throws(() => developmentFlags('up', ['--observability', '--observability']), /repeated/)
  assert.throws(() => developmentFlags('up', ['--tunnel']), /Unsupported/)
  assert.throws(() => developmentFlags('test', ['--observability']), /Unsupported/)
  assert.equal(hostRuntimeEnvironment({ ...env, VUXO_DEV_OTEL_ENABLED: 'true' }).api.Observability__Enabled, 'true')
  const root = ['/tmp/docker/.env.local', '/tmp/docker/compose.dev.yml']
  const app = '/tmp/docker/compose.dev-app.yml'
  const base = composeArguments(...root, 'up', [], app)
  assert.equal(base.includes('otel-collector'), false)
  const selected = composeArguments(...root, 'up', ['ollama', 'observability'], app)
  assert.deepEqual(selected.slice(-3), ['ollama', 'ollama-model-init', 'otel-collector'])
  assert.equal(selected.includes('otel-collector'), true)
  assert.equal(composeArguments(...root, 'ready', 'observability', app).at(-1), 'otel-collector')
  assert.equal(composeArguments(...root, 'infra', 'observability', app).at(-1), 'otel-collector')
  assert.deepEqual(localOtelHealthEndpoint(env), { name: 'OpenTelemetry', url: 'http://127.0.0.1:53133/' })
  env.VUXO_OTEL_DEV_PORT = '54417'
  env.VUXO_OTEL_HEALTH_DEV_PORT = '53233'
  assert.deepEqual(validateLocalEnv(env), [])
  assert.equal(hostRuntimeEnvironment(env).api.Observability__OtlpEndpoint, 'http://127.0.0.1:54417')
  assert.equal(localOtelHealthEndpoint(env).url, 'http://127.0.0.1:53233/')
  env.VUXO_OTEL_DEV_PORT = env.VUXO_POSTGRES_DEV_PORT
  assert.match(validateLocalEnv(env).join(' '), /duplicate local host port/)
  // Existing private .env.local files created before these optional ports
  // remain valid and use the same safe defaults.
  delete env.VUXO_OTEL_DEV_PORT
  delete env.VUXO_OTEL_HEALTH_DEV_PORT
  assert.deepEqual(validateLocalEnv(env), [])
  const compose = readFileSync(new URL('../docker/compose.dev-app.yml', import.meta.url), 'utf8')
  const collector = readFileSync(new URL('../docker/observability/otel-collector.local.yml', import.meta.url), 'utf8')
  assert.match(compose, /profiles: \[observability\]/)
  assert.match(compose, /127\.0\.0\.1:\$\{VUXO_OTEL_DEV_PORT:-54317\}/)
  assert.match(compose, /127\.0\.0\.1:\$\{VUXO_OTEL_HEALTH_DEV_PORT:-53133\}/)
  // Match real production services or URLs, not explanatory comments.
  assert.doesNotMatch(compose, /^\s{2}cloudflared\s*:/m)
  assert.doesNotMatch(compose, /https?:\/\/[^\s]*vuxo\.quest/)
  assert.match(collector, /verbosity: basic/)
  assert.doesNotMatch(collector, /tempo:4317|loki:3100|https?:\/\//)
})

test('local Docker CLI rejects inherited remote daemon and remote Docker context endpoints', () => {
  for (const endpoint of [
    'unix:///var/run/docker.sock',
    'unix:///home/dev/.docker/desktop/docker.sock',
    'unix:///Users/dev/.docker/run/docker.sock',
  ]) assert.equal(isLocalDockerEndpoint(endpoint, 'linux'), true)
  assert.equal(isLocalDockerEndpoint('unix:///var/run/docker.sock', 'darwin'), true)
  for (const endpoint of [
    'npipe:////./pipe/docker_engine',
    'npipe:////./pipe/dockerDesktopLinuxEngine',
  ]) assert.equal(isLocalDockerEndpoint(endpoint, 'win32'), true)
  for (const platform of ['linux', 'win32', 'darwin']) {
    for (const endpoint of [
      'tcp://127.0.0.1:2375',
      'tcp://localhost:2375',
      'tcp://[::1]:2375',
    ]) assert.equal(isLocalDockerEndpoint(endpoint, platform), true)
    for (const endpoint of [
      'ssh://deploy@production-host',
      'tcp://192.168.1.51:2375',
      'tcp://docker.remote.example:2376',
      'https://remote.example:2376',
      'tcp://127.0.0.2:2375',
      'http://localhost:2375/path',
      'tcp://localhost',
      'not-a-docker-endpoint',
      '',
    ]) assert.equal(isLocalDockerEndpoint(endpoint, platform), false, platform + ' must reject remote/invalid endpoint')
  }
  assert.equal(isLocalDockerEndpoint('npipe:////./pipe/docker_engine', 'linux'), false)
  assert.equal(isLocalDockerEndpoint('unix:///var/run/docker.sock', 'win32'), false)
  // No endpoint is interpolated into public diagnostics or thrown errors.
  const cli = readFileSync(new URL('./dev.mjs', import.meta.url), 'utf8')
  assert.match(cli, /assertLocalDockerEngine\(\)/)
  assert.match(cli, /context', 'inspect', '--format'/)
  assert.match(cli, /remote daemon endpoints are refused/)
  assert.doesNotMatch(cli, /new Error\(.*DOCKER_HOST\)/)
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

test('mixed-case Windows-style environment aliases cannot leak into local child processes', () => {
  const privateValues = {
    vuxo_postgres_password: 'prod-postgres-lowercase',
    Vuxo_Cloudflare_Tunnel_Token: 'prod-tunnel-mixedcase',
    vItE_aPi_bAsE_uRl: 'https://private.example.test',
    auth__jwt__signingkey: 'prod-jwt-lowercase',
    connectionstrings__gamedb: 'prod-db-connection',
    observability__otlpendpoint: 'https://private-collector.example.test',
    otel_exporter_otlp_headers: 'Authorization=production-otlp-token',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://private-collector.example.test',
    PATH: '/usr/bin:/bin',
  }
  const safeHost = localHostEnvironment(privateValues, { VITE_API_BASE_URL: 'http://127.0.0.1:8080' })
  const safeDocker = localProcessEnvironment(privateValues, create())
  assert.equal(safeHost.PATH, privateValues.PATH)
  assert.equal(safeDocker.PATH, privateValues.PATH)
  assert.equal(safeHost.VITE_API_BASE_URL, 'http://127.0.0.1:8080')
  for (const secret of Object.values(privateValues).filter(value => value !== privateValues.PATH)) {
    assert.equal(JSON.stringify(safeHost).includes(secret), false)
  }
  assert.equal(safeDocker.vuxo_postgres_password, undefined)
  assert.equal(safeDocker.Vuxo_Cloudflare_Tunnel_Token, undefined)
  assert.notEqual(safeDocker.VUXO_POSTGRES_PASSWORD, privateValues.vuxo_postgres_password)
  // The Docker operation preserves non-VUXO process settings; the stricter
  // host subprocess filter is responsible for OTEL/ASP.NET isolation.
})

test('local debug and test use real Docker health readiness and fixed, shell-free command plans', () => {
  const env = create()
  const root = ['/tmp/docker/.env.local', '/tmp/docker/compose.dev.yml']
  const app = '/tmp/docker/compose.dev-app.yml'
  assert.deepEqual(composeArguments(...root, 'ready', undefined, app).slice(-5),
    ['up', '-d', '--wait', 'postgres', 'redis'])
  assert.deepEqual(hostCommandArguments(env, 'api'), [
    'watch', '--project', 'src/backend/applications/Vuxo.Api/Vuxo.Api.csproj', 'run', '--no-launch-profile',
  ])
  assert.deepEqual(hostCommandArguments(env, 'frontend'), [
    'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort',
  ])
  assert.deepEqual(hostCommandArguments(env, 'dotnet-test'), ['test', 'Vuxo.sln', '-c', 'Release'])
  assert.deepEqual(hostCommandArguments(env, 'npm-install'), ['install', '--no-audit', '--no-fund'])
  assert.deepEqual(hostCommandArguments(env, 'chromium'), ['playwright', 'install', 'chromium'])
  assert.deepEqual(hostCommandArguments(env, 'playwright'), ['run', 'test:e2e'])
  assert.throws(() => hostCommandArguments(env, 'drop-db'), /Unsupported/)
})

test('host debug is loopback only and uses local DB, JWT, Redis, matching CORS and LLM off', () => {
  const env = create()
  const host = hostRuntimeEnvironment(env)
  assert.equal(host.api.ASPNETCORE_ENVIRONMENT, 'Development')
  assert.equal(host.api.ASPNETCORE_URLS, 'http://127.0.0.1:8080')
  assert.equal(host.api.Auth__EnableMockLogin, 'true')
  assert.equal(host.api.Auth__Jwt__SigningKey, env.VUXO_JWT_SIGNING_KEY)
  assert.equal(host.api.Cors__AllowedOrigins__0, env.VUXO_ALLOWED_ORIGIN)
  assert.equal(host.api.Observability__Enabled, 'false')
  assert.equal(host.api.Llm__Enabled, 'false')
  assert.equal(host.api.Redis__ConnectionString, '127.0.0.1:56379')
  assert.match(host.api.ConnectionStrings__GameDb, /Host=127\.0\.0\.1;Port=55432;Database=vuxo/)
  assert.equal(host.frontend.VITE_BASE_PATH, '/Vuxo/')
  assert.equal(host.frontend.VITE_API_BASE_URL, 'http://127.0.0.1:8080')
  assert.match(host.tests.VUXO_TEST_POSTGRES_CONNECTION_STRING, /Database=postgres/)
  assert.match(host.tests.VUXO_TEST_POSTGRES_CONNECTION_STRING, /Pooling=false/)
  assert.equal(host.tests.VUXO_TEST_POSTGRES_CONNECTION_STRING.includes(env.VUXO_POSTGRES_PASSWORD), true)
  assert.equal(JSON.stringify(host).includes('api.vuxoapi.xyz'), false)
  assert.equal(JSON.stringify(host).includes('https://vuxo.quest'), false)
  env.VUXO_API_DEV_PORT = '9008'
  env.VUXO_POSTGRES_DEV_PORT = '55440'
  env.VUXO_FRONTEND_DEV_PORT = '5199'
  env.VUXO_ALLOWED_ORIGIN = 'http://localhost:5199'
  assert.deepEqual(validateLocalEnv(env), [])
  const custom = hostRuntimeEnvironment(env)
  assert.equal(custom.api.ASPNETCORE_URLS, 'http://127.0.0.1:9008')
  assert.equal(custom.frontend.VITE_API_BASE_URL, 'http://127.0.0.1:9008')
  assert.equal(custom.api.Cors__AllowedOrigins__0, 'http://localhost:5199')
  assert.match(custom.tests.VUXO_TEST_POSTGRES_CONNECTION_STRING, /Port=55440/)
})

test('LLM model is validated before optional Compose shell interpolation', () => {
  const env = create()
  env.VUXO_LLM_MODEL = 'qwen3:1.7b;rm -rf /'
  assert.match(validateLocalEnv(env).join(' '), /VUXO_LLM_MODEL/)
  env.VUXO_LLM_MODEL = 'qwen3:1.7b'
  env.VUXO_LLM_ENABLED = 'yes'
  assert.match(validateLocalEnv(env).join(' '), /VUXO_LLM_ENABLED/)
  env.VUXO_LLM_ENABLED = 'false'
  assert.deepEqual(validateLocalEnv(env), [])
})

test('explicit Ollama opt-in uses the configured model but never changes persistent local settings', () => {
  const env = create()
  assert.equal(hostRuntimeEnvironment(env).api.Llm__Enabled, 'false')
  const optedIn = { ...env, VUXO_LLM_ENABLED: 'true' }
  assert.equal(hostRuntimeEnvironment(optedIn).api.Llm__Enabled, 'true')
  assert.equal(env.VUXO_LLM_ENABLED, 'false')
  assert.deepEqual(composeArguments('env', 'base', 'infra', 'ollama', 'overlay').slice(-4),
    ['postgres', 'redis', 'ollama', 'ollama-model-init'])
})

test('up readiness checks actual loopback HTTP 200 for API and Vite, including custom ports', async () => {
  const env = create()
  const endpoints = localHttpEndpoints(env)
  assert.deepEqual(endpoints, [
    { name: 'API', url: 'http://127.0.0.1:8080/health' },
    { name: 'Vite', url: 'http://127.0.0.1:5173/Vuxo/' },
  ])
  env.VUXO_API_DEV_PORT = '9008'
  env.VUXO_FRONTEND_DEV_PORT = '5199'
  env.VUXO_ALLOWED_ORIGIN = 'http://127.0.0.1:5199'
  assert.deepEqual(localHttpEndpoints(env).map(e => e.url), [
    'http://127.0.0.1:9008/health', 'http://127.0.0.1:5199/Vuxo/',
  ])
  let attempts = 0
  let sleeps = 0
  assert.equal(await waitForLocalHttp('http://127.0.0.1:9008/health', {
    request: async () => ({ status: ++attempts === 3 ? 200 : 503 }),
    pause: async () => { sleeps++ },
    attempts: 4,
    intervalMs: 0,
  }), true)
  assert.equal(attempts, 3)
  assert.equal(sleeps, 2)
  let refused = 0
  assert.equal(await waitForLocalHttp('http://127.0.0.1:5199/Vuxo/', {
    request: async () => { refused++; throw new Error('ECONNREFUSED') },
    pause: async () => {},
    attempts: 3,
    intervalMs: 0,
  }), false)
  assert.equal(refused, 3)
  assert.equal(await waitForLocalHttp('http://127.0.0.1:5199/Vuxo/', {
    request: async () => ({ status: 500 }),
    pause: async () => {},
    attempts: 1,
  }), false)
})

test('host npm/Vite/Playwright never inherit private VUXO_* values or production API/ASP.NET settings', () => {
  const config = create()
  const inherited = {
    PATH: '/usr/local/bin:/usr/bin', HOME: '/home/developer',
    VUXO_POSTGRES_PASSWORD: 'production-password',
    VUXO_JWT_SIGNING_KEY: 'production-jwt',
    VUXO_CLOUDFLARE_TUNNEL_TOKEN: 'production-tunnel',
    VITE_API_BASE_URL: 'https://api.vuxoapi.xyz',
    ASPNETCORE_URLS: 'http://0.0.0.0:5000',
    ConnectionStrings__GameDb: 'Host=production',
    Auth__Jwt__SigningKey: 'prod-jwt',
    Cors__AllowedOrigins__0: 'https://vuxo.quest',
    Llm__BaseUrl: 'https://production',
    Observability__Enabled: 'false',
  }
  const frontend = localHostEnvironment(inherited, hostRuntimeEnvironment(config).frontend)
  const npm = localHostEnvironment(inherited)
  const backend = localHostEnvironment(inherited, hostRuntimeEnvironment(config).api)
  const xunit = localHostEnvironment(inherited, hostRuntimeEnvironment(config).tests)
  for (const exposed of [frontend, npm]) {
    assert.equal(exposed.PATH, inherited.PATH)
    assert.equal(exposed.HOME, inherited.HOME)
    for (const secret of ['production-password', 'production-jwt', 'production-tunnel',
      'https://api.vuxoapi.xyz', 'Host=production', 'prod-jwt', 'https://vuxo.quest']) {
      assert.equal(JSON.stringify(exposed).includes(secret), false)
    }
    assert.equal(JSON.stringify(exposed).includes(config.VUXO_POSTGRES_PASSWORD), false)
    assert.equal(JSON.stringify(exposed).includes(config.VUXO_JWT_SIGNING_KEY), false)
  }
  assert.equal(frontend.VITE_API_BASE_URL, 'http://127.0.0.1:8080')
  assert.equal(backend.ASPNETCORE_URLS, 'http://127.0.0.1:8080')
  assert.equal(backend.Auth__Jwt__SigningKey, config.VUXO_JWT_SIGNING_KEY)
  assert.equal(xunit.VUXO_TEST_POSTGRES_CONNECTION_STRING.includes(config.VUXO_POSTGRES_PASSWORD), true)
  assert.equal(Object.hasOwn(xunit, 'Auth__Jwt__SigningKey'), false)
  // xUnit must see the checked-in default Observability:Enabled=true: its
  // metadata API tests assert that contract. Do not override it via CLI.
  assert.equal(Object.hasOwn(xunit, 'Observability__Enabled'), false)
  const cli = readFileSync(new URL('./dev.mjs', import.meta.url), 'utf8')
  assert.match(cli, /rootDir, localHostEnvironment\(process\.env, host\.tests\)\)/)
})

test('host CLI diagnostic classification never echoes private child stdout/stderr', () => {
  const secret = 'POSTGRES_PASSWORD_SECRETVALUE JWT_SECRET_TOKEN'
  const cases = [
    ['VUXO dev: npm install: failed (exit 1)', 'npm install failure'],
    ['VUXO dev: dotnet watch: exited (1)', '.NET watch failure'],
    ['VUXO dev: vite: exited (127)', 'Vite subprocess failure'],
    ['VUXO dev: Docker command failed (exit 1)', 'Docker Compose subprocess failure'],
    ['Local IDE debug: API and Vite on 127.0.0.1', 'host processes exited after startup'],
  ]
  for (const [message, category] of cases) {
    const output = classifyHostDebugFailure(message + '\\n' + secret)
    assert.equal(output, category)
    assert.doesNotMatch(output, /SECRETVALUE|SECRET_TOKEN/)
  }
  assert.doesNotMatch(classifyHostDebugFailure(secret), /SECRETVALUE|SECRET_TOKEN/)
})

test('native debug observability smoke exercises real local collector and admin metadata', () => {
  const smoke = readFileSync(new URL('./dev-host-smoke.mjs', import.meta.url), 'utf8')
  assert.match(smoke, /'debug-observability'/)
  assert.match(smoke, /\.\.\.\(observability \? \['--observability'\] : \[\]\)/)
  assert.match(smoke, /await import\('\.\/dev-smoke\.mjs'\)/)
  assert.match(smoke, /if \(observability\) await import\('\.\/dev-otel-smoke\.mjs'\)/)
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.match(workflow, /node scripts\/dev-host-smoke\.mjs debug-observability/)
  assert.doesNotMatch(workflow, /node scripts\/dev-host-smoke\.mjs debug\s*\n/)
})

test('host smoke uses an absolute deadline and reports only static phases', () => {
  const secret = 'local-private-jwt-and-postgres-password'
  assert.equal(classifyHostDebugStage('VUXO_DEV_STAGE:npm-install' + secret),
    'host npm dependency install')
  assert.equal(classifyHostDebugStage('VUXO_DEV_STAGE:host-watch' + secret),
    'native API/Vite startup')
  assert.equal(classifyHostDebugStage(secret), 'Docker dependency initialization')
  assert.doesNotMatch(classifyHostDebugStage(secret), /local-private/)
  const smoke = readFileSync(new URL('./dev-host-smoke.mjs', import.meta.url), 'utf8')
  assert.match(smoke, /Date\.now\(\) \+ 7 \* 60_000/)
  assert.match(smoke, /unavailable: /)
  assert.doesNotMatch(smoke, /for \(let attempt = 0; attempt < 150/)
})

test('development Docker uses host ownership, isolated caches and no checkout chown', () => {
  assert.deepEqual(localDockerIdentity('linux', 1001, 1100),
    { VUXO_DEV_UID: '1001', VUXO_DEV_GID: '1100' })
  assert.deepEqual(localDockerIdentity('win32'),
    { VUXO_DEV_UID: '1000', VUXO_DEV_GID: '1000' })
  assert.deepEqual(localDockerIdentity('linux', -1, Number.NaN),
    { VUXO_DEV_UID: '1000', VUXO_DEV_GID: '1000' })
  const inherited = { VUXO_DEV_UID: '0', VUXO_DEV_GID: '0', PATH: '/usr/bin' }
  const safe = localProcessEnvironment(inherited, {
    ...create(), ...localDockerIdentity('linux', 1001, 1100),
  })
  assert.equal(safe.VUXO_DEV_UID, '1001')
  assert.equal(safe.VUXO_DEV_GID, '1100')
  const compose = readFileSync(new URL('../docker/compose.dev-app.yml', import.meta.url), 'utf8')
  assert.equal(compose.split('user: "').length - 1, 3)
  assert.equal(compose.split('service_completed_successfully').length - 1, 2)
  assert.match(compose, /NUGET_PACKAGES: \/nuget/)
  assert.match(compose, /NPM_CONFIG_CACHE: \/tmp\/.npm-cache/)
  assert.match(compose, /--package-lock=false/)
  assert.doesNotMatch(compose, /privileged:|--privileged|chown.*\/workspace/)
  assert.match(compose, /127\.0\.0\.1:/)
})

test('nested Docker volume mountpoint is precreated by host non-destructively', () => {
  const root = mkdtempSync(join(tmpdir(), 'vuxo-dev-mount-'))
  try {
    const mount = join(root, 'src', 'frontend', 'node_modules')
    prepareHostDependencyMount(mount)
    writeFileSync(join(mount, 'existing.txt'), 'unchanged')
    prepareHostDependencyMount(mount)
    assert.equal(readFileSync(join(mount, 'existing.txt'), 'utf8'), 'unchanged')
    const notDirectory = join(root, 'not-a-directory')
    writeFileSync(notDirectory, 'keep')
    assert.throws(() => prepareHostDependencyMount(notDirectory), /mountpoint is not writable/)
    assert.equal(readFileSync(notDirectory, 'utf8'), 'keep')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
