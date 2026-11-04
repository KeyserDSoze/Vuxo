#!/usr/bin/env node
// One local workflow on Windows PowerShell/cmd and Linux shells. No Bash required.
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateLocalEnv, hostEnvironment, infrastructurePlan, parseEnv, validateLocalEnv } from './dev-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localPath = join(root, 'docker', '.env.local');
const samplePath = join(root, 'docker', 'local.env.example');
const frontendDir = join(root, 'src', 'frontend');
const apiProject = 'src/backend/applications/Vuxo.Api/Vuxo.Api.csproj';
const command = process.argv[2] ?? 'help';

function info(message) { process.stdout.write('[VUXO] ' + message + '\n'); }
function fail(message) { process.stderr.write('[VUXO] ERROR: ' + message + '\n'); process.exitCode = 1; }
function generatedSecret() { return randomBytes(36).toString('base64url'); }

function init() {
  if (existsSync(localPath)) {
    info('Existing docker/.env.local preserved. Edit it to change ports and configuration.');
    return;
  }
  const output = generateLocalEnv(readFileSync(samplePath, 'utf8'), generatedSecret);
  writeFileSync(localPath, output, { mode: 0o600, flag: 'wx' });
  info('Created private docker/.env.local with independent random PostgreSQL/JWT/Grafana credentials.');
}

function load() {
  if (!existsSync(localPath)) init();
  const parsed = parseEnv(readFileSync(localPath, 'utf8'));
  // Explicit process environment overrides the local file, as with Docker Compose.
  const merged = { ...parsed };
  for (const key of Object.keys(parsed)) {
    if (Object.hasOwn(process.env, key)) merged[key] = process.env[key];
  }
  return validateLocalEnv(merged);
}

function execute(binary, args, options = {}) {
  info('Running: ' + binary + ' ' + args.join(' '));
  const windowsCmd = process.platform === 'win32' && ['npm', 'npx'].includes(binary);
  // cmd.exe is required for npm.cmd/npx.cmd on native Windows Node.
  const executable = windowsCmd ? 'cmd.exe' : binary;
  const argumentsList = windowsCmd ? ['/d', '/s', '/c', binary, ...args] : args;
  const result = spawnSync(executable, argumentsList, {
    cwd: options.cwd ?? root, env: options.env ?? process.env,
    stdio: 'inherit', shell: false, windowsHide: true,
  });
  if (result.error) throw new Error(binary + ' could not start: ' + result.error.message);
  if (result.signal) throw new Error(binary + ' terminated by ' + result.signal);
  if (result.status !== 0) throw new Error(binary + ' exited with status ' + result.status);
}

function composeArguments(config, withObservability) {
  const args = [
    'compose', '--project-name', config.VUXO_COMPOSE_PROJECT,
    '--env-file', localPath,
    '-f', 'docker/compose.dev.yml',
    '-f', 'docker/compose.local.yml',
  ];
  if (withObservability) args.push('-f', 'docker/compose.observability.yml');
  return args;
}

function runtime(config) {
  const enabled = config.VUXO_OBSERVABILITY_ENABLED === 'true';
  const environment = {
    ...process.env, ...config,
    VUXO_GRAFANA_URL: 'http://localhost:' + config.VUXO_GRAFANA_PORT,
  };
  const base = composeArguments(config, enabled);
  return {
    environment,
    run: (...args) => execute('docker', [...base, ...args], { env: environment }),
  };
}

async function ready(url, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { info('Ready: ' + url); return; }
    } catch { /* Not up yet; retry until deadline. */ }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Timed out waiting for ' + url + '. Use node scripts/dev.mjs logs to inspect startup.');
}

function startInfrastructure(config) {
  const runner = runtime(config);
  const plan = infrastructurePlan(config);
  // Switching from full Docker to infra/debug/test releases API/Vite host ports.
  // Compose stop does not remove any named database/cache volumes.
  runner.run('stop', ...plan.stop);
  runner.run('up', '-d', '--wait', '--wait-timeout', '180', ...plan.start);
  if (plan.initializeModel) {
    info('Downloading/checking local Ollama model ' + config.VUXO_LLM_MODEL);
    runner.run('run', '--rm', '--no-deps', 'ollama-model-init');
  }
}

async function full(config) {
  const runner = runtime(config);
  const services = ['api', 'frontend'];
  if (config.VUXO_LLM_ENABLED === 'true') services.push('ollama');
  if (config.VUXO_OBSERVABILITY_ENABLED === 'true') services.push('grafana');
  runner.run('up', '-d', '--wait', '--wait-timeout', '240', ...services);
  if (config.VUXO_LLM_ENABLED === 'true') {
    runner.run('run', '--rm', '--no-deps', 'ollama-model-init');
  }
  await ready('http://127.0.0.1:' + config.VUXO_API_PORT + '/health');
  await ready('http://127.0.0.1:' + config.VUXO_FRONTEND_PORT + '/');
  info('Full Docker mode: frontend http://localhost:' + config.VUXO_FRONTEND_PORT +
    '/ | API http://127.0.0.1:' + config.VUXO_API_PORT + '/health');
}

function launch(executable, args, options) {
  const isWindowsNpm = process.platform === 'win32' && executable === 'npm';
  const child = spawn(isWindowsNpm ? 'cmd.exe' : executable,
    isWindowsNpm ? ['/d', '/s', '/c', executable, ...args] : args,
    { cwd: options.cwd, env: options.env, stdio: 'inherit', windowsHide: true });
  child.on('error', error => fail(executable + ': ' + error.message));
  return child;
}

async function debug(config) {
  startInfrastructure(config);
  if (!existsSync(join(frontendDir, 'node_modules'))) {
    execute('npm', ['install', '--no-audit', '--no-fund'], { cwd: frontendDir });
  }
  const environment = { ...process.env, ...config, ...hostEnvironment(config) };
  const processes = [
    launch('dotnet', ['watch', '--non-interactive', '--project', apiProject,
      'run', '--no-launch-profile'], { cwd: root, env: environment }),
    launch('npm', ['run', 'dev', '--', '--host', '127.0.0.1',
      '--port', config.VUXO_FRONTEND_PORT, '--strictPort'], { cwd: frontendDir, env: environment }),
  ];
  info('IDE debug mode. Attach to the local Vuxo.Api dotnet process, or run the API from your IDE with the same environment.');
  info('Frontend: http://127.0.0.1:' + config.VUXO_FRONTEND_PORT +
    '/ | API: http://127.0.0.1:' + config.VUXO_API_PORT + '/health');
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    for (const child of processes) if (child && !child.killed) child.kill('SIGTERM');
    info('Local host processes stopped; Docker data services are still available (use down to stop them).');
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  const firstExit = await Promise.race(processes.map(child => new Promise(resolve =>
    child.once('exit', (code, signal) => resolve({ code, signal })) )));
  if (!stopping && firstExit.code !== 0) process.exitCode = firstExit.code ?? 1;
  shutdown();
  await Promise.all(processes.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', resolve);
  })));
}

function doctor(config) {
  const environment = runtime(config).environment;
  execute('docker', ['--version'], { env: environment });
  execute('docker', ['compose', 'version'], { env: environment });
  execute('dotnet', ['--version'], { env: environment });
  execute('node', ['--version'], { env: environment });
  execute('npm', ['--version'], { env: environment });
  info('Configuration valid: project ' + config.VUXO_COMPOSE_PROJECT +
    ', API ' + config.VUXO_API_PORT + ', frontend ' + config.VUXO_FRONTEND_PORT +
    ', PostgreSQL ' + config.VUXO_POSTGRES_DEV_PORT + ', Redis ' + config.VUXO_REDIS_DEV_PORT);
  runtime(config).run('config', '--quiet');
  info('Docker/Compose/SDK/Node and local Compose syntax verified.');
}

function tests(config) {
  startInfrastructure(config);
  const environment = { ...process.env, ...config, ...hostEnvironment(config) };
  execute('node', ['--test', 'tests/dev/local-dev.test.mjs'], { env: environment });
  execute('dotnet', ['restore', 'Vuxo.sln'], { env: environment });
  execute('dotnet', ['build', 'Vuxo.sln', '-c', 'Release', '--no-restore'], { env: environment });
  execute('dotnet', ['test', 'Vuxo.sln', '-c', 'Release', '--no-build'], { env: environment });
  execute('npm', ['install', '--no-audit', '--no-fund'], { cwd: frontendDir, env: environment });
  execute('npm', ['run', 'build'], { cwd: frontendDir, env: environment });
  execute('npx', ['playwright', 'install', 'chromium'], { cwd: frontendDir, env: environment });
  // The existing Playwright suite uses its explicit deterministic E2E adapters.
  execute('npm', ['run', 'test:e2e'], { cwd: frontendDir, env: environment });
  info('Node contracts, .NET xUnit (real PostgreSQL), frontend build, and Playwright passed.');
}

function printHelp() {
  process.stdout.write([
    'VUXO local development — Windows PowerShell/cmd and Linux/macOS (Node 24, .NET 10, Docker Compose).',
    '',
    '  node scripts/dev.mjs init     Create ignored docker/.env.local with random local secrets',
    '  node scripts/dev.mjs doctor   Validate tools, ports and Compose',
    '  node scripts/dev.mjs infra    PostgreSQL + Redis (+ optional Ollama) in Docker',
    '  node scripts/dev.mjs up       Full local Docker: API + React + data (+ optional services)',
    '  node scripts/dev.mjs debug    Docker data services; hot-reload .NET + Vite on the host',
    '  node scripts/dev.mjs smoke    Check local Docker API/frontend /health endpoints',
    '  node scripts/dev.mjs test     Node + .NET xUnit/PostgreSQL + build + Playwright',
    '  node scripts/dev.mjs status   Show local Docker service status',
    '  node scripts/dev.mjs logs     Follow local Docker logs',
    '  node scripts/dev.mjs down     Stop local Docker containers (PRESERVES volumes)',
    '',
    'For IDE breakpoints, use debug (host dotnet) rather than attaching to the Docker API.',
    '',
  ].join('\n') + '\n');
}

async function main() {
  if (command === 'help' || command === '--help' || command === '-h') { printHelp(); return; }
  if (command === 'init') { init(); return; }
  const config = load();
  const runner = runtime(config);
  switch (command) {
    case 'doctor': doctor(config); break;
    case 'infra': startInfrastructure(config); break;
    case 'up': await full(config); break;
    case 'debug': await debug(config); break;
    case 'test': tests(config); break;
    case 'smoke':
      await ready('http://127.0.0.1:' + config.VUXO_API_PORT + '/health', 10000);
      await ready('http://127.0.0.1:' + config.VUXO_FRONTEND_PORT + '/', 10000);
      break;
    case 'status': runner.run('ps', '--all'); break;
    case 'logs': runner.run('logs', '--follow', '--tail', '150'); break;
    case 'down': runner.run('down', '--remove-orphans'); info('Stopped local services. Named volumes preserved.'); break;
    default: printHelp(); throw new Error('Unknown subcommand: ' + command);
  }
}

main().catch(error => { fail(error.message); });
