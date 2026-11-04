// Pure helpers used by the cross-platform local runtime and its regression tests.
export const portKeys = [
  'VUXO_API_PORT',
  'VUXO_FRONTEND_PORT',
  'VUXO_POSTGRES_DEV_PORT',
  'VUXO_REDIS_DEV_PORT',
  'VUXO_OLLAMA_DEV_PORT',
  'VUXO_GRAFANA_PORT',
  'VUXO_E2E_PORT',
];

export function parseEnv(source) {
  const result = {};
  for (const [index, rawLine] of source.replace(/\r\n/g, '\n').split('\n').entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error('Invalid environment line ' + (index + 1));
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

export function generateLocalEnv(template, generateSecret) {
  let result = template;
  for (const key of ['VUXO_POSTGRES_PASSWORD', 'VUXO_JWT_SIGNING_KEY', 'VUXO_GRAFANA_ADMIN_PASSWORD']) {
    const regexp = new RegExp('^' + key + '=.*$', 'm');
    if (!regexp.test(result)) throw new Error('Missing local secret setting: ' + key);
    result = result.replace(regexp, key + '=' + generateSecret());
  }
  return result;
}

export function validateLocalEnv(config) {
  const project = config.VUXO_COMPOSE_PROJECT ?? '';
  if (!/^vuxo-local(?:-[a-z0-9]+)*$/.test(project)) {
    throw new Error('VUXO_COMPOSE_PROJECT must be vuxo-local or vuxo-local-<name> to avoid production collisions');
  }
  const known = new Map();
  for (const key of portKeys) {
    const raw = config[key];
    if (!/^[0-9]+$/.test(raw ?? '')) throw new Error(key + ' must be an integer TCP port');
    const number = Number(raw);
    if (number < 1 || number > 65535) throw new Error(key + ' must be between 1 and 65535');
    if (known.has(number)) throw new Error(key + ' conflicts with ' + known.get(number) + ' on port ' + number);
    known.set(number, key);
  }
  for (const key of ['VUXO_POSTGRES_PASSWORD', 'VUXO_JWT_SIGNING_KEY', 'VUXO_GRAFANA_ADMIN_PASSWORD']) {
    if (!config[key] || config[key].includes('GENERATED_BY_INIT') || /[\r\n]/.test(config[key])) {
      throw new Error(key + ' must contain a generated local secret (run init)');
    }
  }
  // These values enter the PostgreSQL connection-string and Ollama's shell-based model pull.
  // Reject delimiters/injection syntax rather than silently constructing a different command.
  if (!/^[A-Za-z0-9_-]{16,}$/.test(config.VUXO_POSTGRES_PASSWORD)) {
    throw new Error('VUXO_POSTGRES_PASSWORD must have at least 16 URL-safe characters');
  }
  if (config.VUXO_GRAFANA_ADMIN_PASSWORD.length < 16) {
    throw new Error('VUXO_GRAFANA_ADMIN_PASSWORD must have at least 16 characters');
  }
  if (config.VUXO_JWT_SIGNING_KEY.length < 32) throw new Error('VUXO_JWT_SIGNING_KEY must contain at least 32 characters');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(config.VUXO_LLM_MODEL ?? '')) {
    throw new Error('VUXO_LLM_MODEL must be an Ollama model identifier without shell metacharacters');
  }
  for (const key of ['VUXO_LLM_ENABLED', 'VUXO_OBSERVABILITY_ENABLED']) {
    if (!['true', 'false'].includes(config[key])) throw new Error(key + ' must be true or false');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(config.VUXO_POSTGRES_USER ?? '') || !/^[a-zA-Z0-9_-]+$/.test(config.VUXO_POSTGRES_DB ?? '')) {
    throw new Error('PostgreSQL user/database must be simple names');
  }
  return config;
}

// Explicit, deterministic plan for infra/debug/test: stop only app services before
// binding their published ports on the host, without removing any named volumes.
export function infrastructurePlan(config) {
  const withLlm = config.VUXO_LLM_ENABLED === 'true';
  return {
    stop: ['frontend', 'api'],
    start: ['postgres', 'redis', ...(withLlm ? ['ollama'] : [])],
    initializeModel: withLlm,
  };
}

export function hostEnvironment(config) {
  return {
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: 'http://127.0.0.1:' + config.VUXO_API_PORT,
    ConnectionStrings__GameDb: 'Host=127.0.0.1;Port=' + config.VUXO_POSTGRES_DEV_PORT +
      ';Database=' + config.VUXO_POSTGRES_DB + ';Username=' + config.VUXO_POSTGRES_USER +
      ';Password=' + config.VUXO_POSTGRES_PASSWORD,
    Redis__ConnectionString: '127.0.0.1:' + config.VUXO_REDIS_DEV_PORT,
    Auth__Jwt__Issuer: 'Vuxo',
    Auth__Jwt__Audience: 'Vuxo.Web',
    Auth__Jwt__SigningKey: config.VUXO_JWT_SIGNING_KEY,
    Auth__EnableMockLogin: 'true',
    Auth__Microsoft__ClientId: config.VUXO_MICROSOFT_CLIENT_ID ?? '',
    Auth__Microsoft__TenantId: config.VUXO_MICROSOFT_TENANT_ID ?? 'common',
    Auth__Google__ClientId: config.VUXO_GOOGLE_CLIENT_ID ?? '',
    Cors__AllowedOrigins__0: 'http://localhost:' + config.VUXO_FRONTEND_PORT,
    Cors__AllowedOrigins__1: 'http://127.0.0.1:' + config.VUXO_FRONTEND_PORT,
    Database__ApplyMigrationsOnStartup: 'true',
    Llm__Enabled: config.VUXO_LLM_ENABLED,
    Llm__BaseUrl: 'http://127.0.0.1:' + config.VUXO_OLLAMA_DEV_PORT + '/v1',
    Llm__Model: config.VUXO_LLM_MODEL,
    VITE_BASE_PATH: '/',
    VITE_API_BASE_URL: 'http://127.0.0.1:' + config.VUXO_API_PORT,
    VITE_HMR_CLIENT_PORT: config.VUXO_FRONTEND_PORT,
    VUXO_TEST_POSTGRES_CONNECTION_STRING: 'Host=127.0.0.1;Port=' +
      config.VUXO_POSTGRES_DEV_PORT + ';Database=postgres;Username=' +
      config.VUXO_POSTGRES_USER + ';Password=' + config.VUXO_POSTGRES_PASSWORD +
      ';Pooling=false;Include Error Detail=true',
    VUXO_E2E_PORT: config.VUXO_E2E_PORT,
  };
}
