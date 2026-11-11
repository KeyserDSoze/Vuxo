#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseLocalEnv, renderLocalEnv, validateLocalEnv, composeArguments } from './dev-lib.mjs'

const templateFile = fileURLToPath(new URL('../docker/local.env.example', import.meta.url))
const envFile = fileURLToPath(new URL('../docker/.env.local', import.meta.url))
const composeFile = fileURLToPath(new URL('../docker/compose.dev.yml', import.meta.url))

const help = () => console.log(`VUXO local development (0.0.1)
  node scripts/dev.mjs init              Create docker/.env.local, never overwrite
  node scripts/dev.mjs doctor            Validate local config and installed tools
  node scripts/dev.mjs infra [--ollama]  Start loopback PostgreSQL/Redis (Ollama opt-in)
  node scripts/dev.mjs status            Show local Compose container status
  node scripts/dev.mjs logs [service]    Show last 100 lines of local service logs
  node scripts/dev.mjs down              Stop local services; keep data volumes

API/Vite Docker 'up', host IDE 'debug' and coordinated 'test' are planned in #45.
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

async function docker(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit', shell: false, windowsHide: true })
    child.once('error', () => reject(new Error('Cannot start Docker CLI. Run doctor and check Docker Desktop/Engine.')))
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Docker command failed (exit ' + code + ')')))
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
  const optionsValid = command === 'infra' ? (options.length === 0 || (options.length === 1 && options[0] === '--ollama'))
    : command === 'logs' ? options.length <= 1 : options.length === 0
  if (!['infra', 'status', 'logs', 'down'].includes(command) || !optionsValid) {
    throw new Error('Unknown command or unsupported options; run: node scripts/dev.mjs help')
  }
  checkedEnv()
  await docker(composeArguments(envFile, composeFile, 'check'))
  const extra = command === 'infra' ? (options[0] === '--ollama' ? 'ollama' : undefined) : options[0]
  await docker(composeArguments(envFile, composeFile, command, extra))
}

main(process.argv.slice(2)).catch(error => {
  // Do not print an untrusted child-process stderr or environment variable
  // contents: they can contain credentials. Show only static local errors.
  console.error('VUXO dev: ' + error.message)
  process.exitCode = 1
})
