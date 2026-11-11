import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const REQUIRED_PORTS = [
  'VUXO_API_DEV_PORT',
  'VUXO_FRONTEND_DEV_PORT',
  'VUXO_POSTGRES_DEV_PORT',
  'VUXO_REDIS_DEV_PORT',
  'VUXO_OLLAMA_DEV_PORT',
]

/** Copy a tracked, non-secret template into a private, never-overwritten file. */
export function renderLocalEnv(template, entropy = randomBytes) {
  const markers = [
    ['GENERATE_POSTGRES_PASSWORD', 32],
    ['GENERATE_JWT_SIGNING_KEY', 48],
  ]
  let result = template
  for (const [marker, bytes] of markers) {
    if (result.split(marker).length !== 2) {
      throw new Error('Local environment template is missing or duplicates a secret marker')
    }
    result = result.replace(marker, entropy(bytes).toString('hex'))
  }
  return result
}

/** Local values are deliberately a plain KEY=VALUE format, without shell evaluation. */
export function parseLocalEnv(source) {
  const values = Object.create(null)
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (!match) throw new Error('Invalid local environment entry (expected KEY=VALUE)')
    if (Object.hasOwn(values, match[1])) throw new Error('Duplicate local environment key: ' + match[1])
    values[match[1]] = match[2]
  }
  return values
}

/** Report key names only; never interpolate the environment's secret values. */
export function validateLocalEnv(values) {
  const errors = []
  for (const name of ['VUXO_POSTGRES_PASSWORD', 'VUXO_JWT_SIGNING_KEY']) {
    if (!/^[a-f0-9]{48,}$/.test(values[name] ?? '')) errors.push(name + ': missing or insecure local secret')
  }
  // A user can override the frontend port; CORS must follow that port.
  const frontendPort = values.VUXO_FRONTEND_DEV_PORT
  if (!['http://127.0.0.1:' + frontendPort, 'http://localhost:' + frontendPort]
      .includes(values.VUXO_ALLOWED_ORIGIN)) {
    errors.push('VUXO_ALLOWED_ORIGIN: expected a local Vite origin on VUXO_FRONTEND_DEV_PORT')
  }
  if (!/^[a-zA-Z0-9_]+$/.test(values.VUXO_POSTGRES_DB ?? '') ||
      !/^[a-zA-Z0-9_]+$/.test(values.VUXO_POSTGRES_USER ?? '')) {
    errors.push('PostgreSQL local database/user name invalid')
  }
  if (!['true', 'false'].includes(values.VUXO_LLM_ENABLED)) {
    errors.push('VUXO_LLM_ENABLED: expected true or false')
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*:[a-zA-Z0-9._-]+$/.test(values.VUXO_LLM_MODEL ?? '')) {
    errors.push('VUXO_LLM_MODEL: expected safe model:tag without whitespace or shell characters')
  }
  const ports = new Set()
  for (const name of REQUIRED_PORTS) {
    const raw = values[name]
    const port = Number(raw)
    if (!/^[1-9][0-9]{0,4}$/.test(raw ?? '') || !Number.isInteger(port) || port > 65535) {
      errors.push(name + ': expected a TCP port between 1 and 65535')
    } else if (ports.has(port)) {
      errors.push(name + ': duplicate local host port')
    } else {
      ports.add(port)
    }
  }
  return errors
}


/** Host-only API/Vite configuration: no production endpoints or trusted client positions. */
export function hostRuntimeEnvironment(config) {
  const pgHost = '127.0.0.1'
  const db = `Host=${pgHost};Port=${config.VUXO_POSTGRES_DEV_PORT};Database=${config.VUXO_POSTGRES_DB};Username=${config.VUXO_POSTGRES_USER};Password=${config.VUXO_POSTGRES_PASSWORD};Pooling=false`
  return {
    api: {
      ASPNETCORE_ENVIRONMENT: 'Development',
      ASPNETCORE_URLS: `http://127.0.0.1:${config.VUXO_API_DEV_PORT}`,
      ConnectionStrings__GameDb: db,
      Redis__ConnectionString: `127.0.0.1:${config.VUXO_REDIS_DEV_PORT}`,
      Auth__Jwt__Issuer: 'Vuxo',
      Auth__Jwt__Audience: 'Vuxo.Web',
      Auth__Jwt__SigningKey: config.VUXO_JWT_SIGNING_KEY,
      Auth__EnableMockLogin: 'true',
      Cors__AllowedOrigins__0: config.VUXO_ALLOWED_ORIGIN,
      Database__ApplyMigrationsOnStartup: 'true',
      Observability__Enabled: 'false',
      Llm__Enabled: config.VUXO_LLM_ENABLED,
      Llm__BaseUrl: `http://127.0.0.1:${config.VUXO_OLLAMA_DEV_PORT}/v1`,
      Llm__Model: config.VUXO_LLM_MODEL,
    },
    frontend: {
      VITE_BASE_PATH: '/Vuxo/',
      VITE_API_BASE_URL: `http://127.0.0.1:${config.VUXO_API_DEV_PORT}`,
    },
    tests: {
      VUXO_TEST_POSTGRES_CONNECTION_STRING:
        `Host=127.0.0.1;Port=${config.VUXO_POSTGRES_DEV_PORT};Database=postgres;Username=${config.VUXO_POSTGRES_USER};Password=${config.VUXO_POSTGRES_PASSWORD};Pooling=false;Include Error Detail=true`,
    },
  }
}

export function hostCommandArguments(config, operation) {
  if (operation === 'api') return ['watch', '--project',
    'src/backend/applications/Vuxo.Api/Vuxo.Api.csproj', 'run', '--no-launch-profile']
  if (operation === 'frontend') return ['run', 'dev', '--',
    '--host', '127.0.0.1', '--port', config.VUXO_FRONTEND_DEV_PORT, '--strictPort']
  if (operation === 'dotnet-test') return ['test', 'Vuxo.sln', '-c', 'Release']
  if (operation === 'npm-install') return ['install', '--no-audit', '--no-fund']
  if (operation === 'chromium') return ['playwright', 'install', 'chromium']
  if (operation === 'playwright') return ['run', 'test:e2e']
  throw new Error('Unsupported host workflow')
}


/**
 * Host API, npm, Vite and Playwright subprocesses must not inherit secrets
 * from a production shell or the private Docker environment. Explicit API
 * credentials are added only to the API process; frontend tools see VITE_*
 * public values and regular OS PATH/HOME, never local VUXO_* passwords.
 */
export function localHostEnvironment(processEnvironment, explicitValues = {}) {
  const forbidden = /^(?:VUXO_|VITE_|ASPNETCORE_|Auth__|ConnectionStrings__|Redis__|Cors__|Database__|Llm__|Observability__)/
  return {
    ...Object.fromEntries(Object.entries(processEnvironment).filter(([key]) => !forbidden.test(key))),
    ...explicitValues,
  }
}

/**
 * Classify CLI exits without ever echoing captured stdout/stderr. Those streams
 * may contain connection strings, JWTs or data emitted by a child process.
 */
export function classifyHostDebugFailure(log) {
  const patterns = [
    ['VUXO dev: npm install', 'npm install failure'],
    ['VUXO dev: dotnet watch', '.NET watch failure'],
    ['VUXO dev: vite', 'Vite subprocess failure'],
    ['VUXO dev: Docker command failed', 'Docker Compose subprocess failure'],
    ['VUXO dev: Cannot start Docker', 'Docker executable unavailable'],
    ['VUXO dev: Local', 'local configuration validation failure'],
    ['VUXO dev: npm', 'npm executable or command failure'],
    ['Local IDE debug: API and Vite', 'host processes exited after startup'],
  ]
  for (const [pattern, category] of patterns) {
    if (typeof log === 'string' && log.includes(pattern)) return category
  }
  return 'host CLI exited unexpectedly; inspect local development commands'
}

/** Readiness is checked from the developer's host, not merely Docker container state. */
export function localHttpEndpoints(config) {
  return [
    { name: 'API', url: `http://127.0.0.1:${config.VUXO_API_DEV_PORT}/health` },
    { name: 'Vite', url: `http://127.0.0.1:${config.VUXO_FRONTEND_DEV_PORT}/Vuxo/` },
  ]
}

export async function waitForLocalHttp(url, {
  request = fetch, pause = delay, attempts = 150, intervalMs = 2000,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) })
      await response.body?.cancel()
      if (response.status === 200) return true
    } catch {
      // Cold .NET restore/npm installs and early connection refusals are
      // expected during boot; timeout still produces a non-zero CLI exit.
    }
    if (attempt + 1 < attempts) await pause(intervalMs)
  }
  return false
}

const ALLOWED_LOG_SERVICES = new Set(['postgres', 'redis', 'ollama', 'ollama-model-init', 'api', 'frontend'])

/** Do not allow inherited production VUXO_* shell variables to override the private dev env-file. */
export function localProcessEnvironment(processEnvironment, localConfig) {
  return {
    ...Object.fromEntries(Object.entries(processEnvironment).filter(([key]) => !key.startsWith('VUXO_'))),
    ...localConfig,
  }
}

export function composeArguments(envFile, composeFile, operation, option = undefined, appComposeFile = undefined) {
  // Shell-free argument arrays prevent command injection or accidental use of
  // the production Compose stack. Compose project names also isolate volumes.
  const prefix = ['compose', '--project-name', 'vuxo-dev', '--env-file', envFile, '-f', composeFile,
    ...(appComposeFile ? ['-f', appComposeFile] : [])]
  if (operation === 'check') return [...prefix, 'config', '--quiet']
  if (operation === 'ready') return [...prefix, 'up', '-d', '--wait', 'postgres', 'redis']
  if (operation === 'infra') return [...prefix, 'up', '-d', 'postgres', 'redis',
    ...(option === 'ollama' ? ['ollama', 'ollama-model-init'] : [])]
  if (operation === 'up') return [...prefix, 'up', '-d', 'postgres', 'redis', 'api', 'frontend',
    ...(option === 'ollama' ? ['ollama', 'ollama-model-init'] : [])]
  if (operation === 'status') return [...prefix, 'ps']
  if (operation === 'down') return [...prefix, 'down'] // Never use -v: preserve local databases.
  if (operation === 'logs') {
    if (option && !ALLOWED_LOG_SERVICES.has(option)) throw new Error('Unknown development service')
    return [...prefix, 'logs', '--tail', '100', ...(option ? [option] : [])]
  }
  throw new Error('Unsupported development command')
}
