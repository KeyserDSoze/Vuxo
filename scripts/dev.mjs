#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseLocalEnv, renderLocalEnv, validateLocalEnv, composeArguments, localProcessEnvironment, hostRuntimeEnvironment, hostCommandArguments, localHttpEndpoints, waitForLocalHttp } from './dev-lib.mjs'

const templateFile = fileURLToPath(new URL('../docker/local.env.example', import.meta.url))
const envFile = fileURLToPath(new URL('../docker/.env.local', import.meta.url))
const composeFile = fileURLToPath(new URL('../docker/compose.dev.yml', import.meta.url))
const appComposeFile = fileURLToPath(new URL('../docker/compose.dev-app.yml', import.meta.url))
const rootDir = fileURLToPath(new URL('../', import.meta.url))
const frontendDir = fileURLToPath(new URL('../src/frontend/', import.meta.url))

const help = () => console.log(`VUXO local development (0.0.1)
  node scripts/dev.mjs init              Create docker/.env.local, never overwrite
  node scripts/dev.mjs doctor            Validate local config and installed tools
  node scripts/dev.mjs infra [--ollama]  Start loopback PostgreSQL/Redis (Ollama opt-in)
  node scripts/dev.mjs up [--ollama]     Docker .NET API + Vite hot reload (Ollama opt-in)
  node scripts/dev.mjs debug [--ollama]  Host .NET/Vite watch after ready local DB/Redis
  node scripts/dev.mjs test              Run xUnit/PostgreSQL and Chromium Playwright
  node scripts/dev.mjs status            Show local Compose container status
  node scripts/dev.mjs logs [service]    Show last 100 lines of local service logs
  node scripts/dev.mjs down              Stop local services; keep data volumes

Windows/Linux smoke and optional observability integration remain open in #45.
No command changes production or deletes database volumes.`)

function checkedEnv() {
  if (!existsSync(envFile)) throw new Error('Private local configuration missing; run: node scripts/dev.mjs init')
  const config = parseLocalEnv(readFileSync(envFile, 'utf8'))
  const errors = validateLocalEnv(config)
  if (errors.length) throw new Error(errors.join('; '))
  return config
}

function installedVersion(binary, args) {
  const windowsNpm = process.platform === 'win32' && binary === 'npm'
  const command = windowsNpm ? 'npm.cmd' : binary
  const result = spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, shell: windowsNpm,
  })
  if (result.error || result.status !== 0) return null
  return String(result.stdout || result.stderr).trim().split('\n')[0]
}

async function docker(args, localConfig) {
  await new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      stdio: 'inherit', shell: false, windowsHide: true,
      env: localProcessEnvironment(process.env, localConfig),
    })
    child.once('error', () => reject(new Error('Cannot start Docker CLI. Run doctor and check Docker Desktop/Engine.')))
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Docker command failed (exit ' + code + ')')))
  })
}


function createHostProcess(binary, args, cwd, environment) {
  const batch = process.platform === 'win32' && (binary === 'npm' || binary === 'npx')
  // Only fixed, internal npm/npx arguments pass through Windows cmd.exe.
  return spawn(batch ? binary + '.cmd' : binary, args, {
    cwd,
    env: environment,
    shell: batch,
    stdio: 'inherit',
    windowsHide: true,
  })
}

async function runHostCommand(label, binary, args, cwd, environment) {
  await new Promise((resolve, reject) => {
    const child = createHostProcess(binary, args, cwd, environment)
    child.once('error', () => reject(new Error(label + ': unable to start executable')))
    child.once('close', code => code === 0 ? resolve()
      : reject(new Error(label + ': failed (exit ' + code + ')')))
  })
}

function stopHostChild(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    // npm.cmd spawns descendants on Windows. Terminate the process tree.
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true, shell: false,
    }).once('error', () => {})
  } else {
    child.kill('SIGTERM')
  }
}

async function runHostDebug(steps) {
  await new Promise((resolve, reject) => {
    const children = []
    let completed = false
    const cleanup = () => {
      process.off('SIGINT', interrupted)
      process.off('SIGTERM', interrupted)
    }
    const finish = error => {
      if (completed) return
      completed = true
      cleanup()
      for (const child of children) stopHostChild(child)
      if (error) reject(error)
      else resolve()
    }
    const interrupted = () => finish(null)
    process.on('SIGINT', interrupted)
    process.on('SIGTERM', interrupted)
    for (const step of steps) {
      const child = createHostProcess(step.binary, step.args, step.cwd, step.env)
      children.push(child)
      child.once('error', () => finish(new Error(step.label + ': could not start; check doctor')))
      child.once('close', code => finish(new Error(step.label + ': exited (' + code + '); stopped the other host process')))
    }
  })
}

async function main(args) {
  const [command = 'help', ...options] = args
  if (command === 'help' || command === '--help' || command === '-h') {
    if (options.length) throw new Error('Unexpected arguments')
    help()
    return
  }
  if (command === 'init') {
    if (options.length) throw new Error('init does not accept options')
    if (existsSync(envFile)) throw new Error('docker/.env.local already exists; refusing to overwrite local secrets')
    const template = readFileSync(templateFile, 'utf8')
    const config = renderLocalEnv(template)
    const errors = validateLocalEnv(parseLocalEnv(config))
    if (errors.length) throw new Error('Local environment template invalid: ' + errors.join('; '))
    try {
      writeFileSync(envFile, config, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error('docker/.env.local already exists; refusing to overwrite')
      throw error
    }
    console.log('Created private docker/.env.local with random local secrets. No existing file was changed.')
    return
  }
  if (command === 'doctor') {
    if (options.length) throw new Error('doctor does not accept options')
    checkedEnv()
    const checks = [
      ['Node.js', process.versions.node, Number(process.versions.node.split('.')[0]) >= 24],
      ['Docker', installedVersion('docker', ['--version']), true],
      ['Docker Compose', installedVersion('docker', ['compose', 'version']), true],
      ['.NET SDK', installedVersion('dotnet', ['--version']), false],
      ['npm', installedVersion('npm', ['--version']), true],
    ]
    let valid = true
    for (const [label, version, requirement] of checks) {
      const good = Boolean(version) && (label === 'Node.js' ? requirement
        : label === '.NET SDK' ? /^10\./.test(version) : true)
      console.log((good ? 'OK' : 'MISSING/UNSUPPORTED') + ': ' + label + (version ? ' ' + version : ''))
      valid &&= good
    }
    if (!valid) throw new Error('Install the missing local tools (Node 24+, .NET 10, Docker Compose, npm)')
    console.log('Local development configuration valid (secrets redacted).')
    return
  }
  const optionsValid = ['infra', 'up', 'debug'].includes(command) ? (options.length === 0 || (options.length === 1 && options[0] === '--ollama'))
    : command === 'logs' ? options.length <= 1 : options.length === 0
  if (!['infra', 'up', 'debug', 'test', 'status', 'logs', 'down'].includes(command) || !optionsValid) {
    throw new Error('Unknown command or unsupported options; run: node scripts/dev.mjs help')
  }
  const config = checkedEnv()
  // --ollama is the explicit user opt-in: start the model service AND enable
  // the API's LLM adapter for this invocation. The private file is unchanged.
  const withOllama = ['infra', 'up', 'debug'].includes(command) && options[0] === '--ollama'
  const runtimeConfig = withOllama ? { ...config, VUXO_LLM_ENABLED: 'true' } : config
  await docker(composeArguments(envFile, composeFile, 'check', undefined, appComposeFile), runtimeConfig)
  if (command === 'debug' || command === 'test') {
    // Wait for actual PostgreSQL and Redis health, rather than simply the
    // process start. test runs use unique PostgreSQL databases per xUnit fact.
    await docker(composeArguments(envFile, composeFile, 'ready', undefined, appComposeFile), runtimeConfig)
    if (withOllama) {
      await docker(composeArguments(envFile, composeFile, 'infra', 'ollama', appComposeFile), runtimeConfig)
    }
    const safeEnvironment = localProcessEnvironment(process.env, runtimeConfig)
    const host = hostRuntimeEnvironment(runtimeConfig)
    if (command === 'debug') {
      await runHostCommand('npm install', 'npm', hostCommandArguments(config, 'npm-install'),
        frontendDir, safeEnvironment)
      console.log('Local IDE debug: API and Vite on 127.0.0.1; stop both with Ctrl+C.')
      const withApi = { ...safeEnvironment, ...host.api }
      const withFrontend = { ...safeEnvironment, ...host.frontend }
      await runHostDebug([
        { label: 'dotnet watch', binary: 'dotnet',
          args: hostCommandArguments(config, 'api'), cwd: rootDir, env: withApi },
        { label: 'vite', binary: 'npm',
          args: hostCommandArguments(config, 'frontend'), cwd: frontendDir, env: withFrontend },
      ])
    } else {
      // Never skip the real PostgreSQL integration tests when running locally.
      await runHostCommand('xUnit/PostgreSQL', 'dotnet', hostCommandArguments(config, 'dotnet-test'),
        rootDir, { ...safeEnvironment, ...host.tests, Observability__Enabled: 'false' })
      await runHostCommand('npm install', 'npm', hostCommandArguments(config, 'npm-install'),
        frontendDir, safeEnvironment)
      await runHostCommand('Chromium install', 'npx', hostCommandArguments(config, 'chromium'),
        frontendDir, safeEnvironment)
      await runHostCommand('Playwright', 'npm', hostCommandArguments(config, 'playwright'),
        frontendDir, { ...safeEnvironment, ...host.frontend })
      console.log('Local xUnit/PostgreSQL and Playwright checks passed.')
    }
    return
  }
  const extra = ['infra', 'up'].includes(command) ? (options[0] === '--ollama' ? 'ollama' : undefined) : options[0]
  await docker(composeArguments(envFile, composeFile, command, extra, appComposeFile), runtimeConfig)
  if (command === 'up') {
    const endpoints = localHttpEndpoints(config)
    const checks = await Promise.all(endpoints.map(async endpoint => ({
      ...endpoint, healthy: await waitForLocalHttp(endpoint.url),
    })))
    const failed = checks.filter(check => !check.healthy)
    if (failed.length) {
      throw new Error('Local ' + failed.map(check => check.name).join('/') +
        ' never returned HTTP 200; inspect node scripts/dev.mjs logs api|frontend')
    }
    console.log('Local development stack ready:')
    for (const endpoint of endpoints) console.log('  ' + endpoint.name + ': ' + endpoint.url)
  }
}

main(process.argv.slice(2)).catch(error => {
  // Do not print an untrusted child-process stderr or environment variable
  // contents: they can contain credentials. Show only static local errors.
  console.error('VUXO dev: ' + error.message)
  process.exitCode = 1
})
