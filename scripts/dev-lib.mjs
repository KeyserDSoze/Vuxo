import { randomBytes } from 'node:crypto'

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

const ALLOWED_LOG_SERVICES = new Set(['postgres', 'redis', 'ollama', 'ollama-model-init'])

export function composeArguments(envFile, composeFile, operation, option = undefined) {
  // Shell-free argument arrays prevent command injection or accidental use of
  // the production Compose stack. Compose project names also isolate volumes.
  const prefix = ['compose', '--project-name', 'vuxo-dev', '--env-file', envFile, '-f', composeFile]
  if (operation === 'check') return [...prefix, 'config', '--quiet']
  if (operation === 'infra') return [...prefix, 'up', '-d', 'postgres', 'redis',
    ...(option === 'ollama' ? ['ollama', 'ollama-model-init'] : [])]
  if (operation === 'status') return [...prefix, 'ps']
  if (operation === 'down') return [...prefix, 'down'] // Never use -v: preserve local databases.
  if (operation === 'logs') {
    if (option && !ALLOWED_LOG_SERVICES.has(option)) throw new Error('Unknown development service')
    return [...prefix, 'logs', '--tail', '100', ...(option ? [option] : [])]
  }
  throw new Error('Unsupported development command')
}
