#!/usr/bin/env node
// Actual native host-process smoke: Linux exercises dev.mjs debug (.NET watch
// + Vite) against real Docker PostgreSQL/Redis; Windows exercises Vite/npm.cmd
// without claiming Windows Docker Desktop or full host API coverage.
// No raw child stdout/stderr, credentials, production hosts or user data logs.
import { spawn } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  hostCommandArguments, hostRuntimeEnvironment, localHostEnvironment,
  localHttpEndpoints, parseLocalEnv, validateLocalEnv,
} from './dev-lib.mjs'

const mode = process.argv[2]
if (!['debug', 'frontend'].includes(mode) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/dev-host-smoke.mjs debug|frontend')
}
const config = parseLocalEnv(readFileSync(new URL('../docker/.env.local', import.meta.url), 'utf8'))
assert.deepEqual(validateLocalEnv(config), [])
const root = fileURLToPath(new URL('../', import.meta.url))
const frontend = fileURLToPath(new URL('../src/frontend/', import.meta.url))
const host = hostRuntimeEnvironment(config)
const windowsNpm = process.platform === 'win32' && mode === 'frontend'
const command = mode === 'debug' ? process.execPath : (windowsNpm ? 'npm.cmd' : 'npm')
const args = mode === 'debug'
  ? ['scripts/dev.mjs', 'debug']
  : hostCommandArguments(config, 'frontend')

const processChild = spawn(command, args, {
  cwd: mode === 'debug' ? root : frontend,
  env: mode === 'debug' ? process.env : localHostEnvironment(process.env, host.frontend),
  shell: windowsNpm, windowsHide: true, stdio: 'ignore',
})
let exited = false
let startupFailed = false
processChild.once('error', () => { exited = true; startupFailed = true })
processChild.once('exit', () => { exited = true })

async function checkHttp(url) {
  try {
    const response = await fetch(url, {
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(2200),
    })
    if (response.status !== 200) {
      await response.body?.cancel()
      return false
    }
    if (url.endsWith('/Vuxo/')) {
      if (!/text\/html/i.test(response.headers.get('content-type') ?? '')) return false
      const html = await response.text()
      return html.includes('<div id="root"')
    }
    await response.body?.cancel()
    return true
  } catch {
    return false
  }
}

async function terminate() {
  if (exited || !processChild.pid) return
  if (process.platform === 'win32') {
    // npm.cmd runs through cmd.exe: kill the entire process tree, not cmd alone.
    const killer = spawn('taskkill', ['/PID', String(processChild.pid), '/T', '/F'],
      { stdio: 'ignore', shell: false, windowsHide: true })
    killer.on('error', () => {})
  } else {
    processChild.kill('SIGINT') // dev.mjs handles SIGINT and stops both host children
  }
  const cancel = new AbortController()
  const closed = new Promise(resolve => processChild.once('close', resolve))
  const grace = delay(12000, null, { signal: cancel.signal }).catch(() => {})
  await Promise.race([closed, grace])
  cancel.abort()
  if (!exited) processChild.kill('SIGKILL')
}

try {
  const endpointList = localHttpEndpoints(config)
  const required = mode === 'debug' ? endpointList : endpointList.filter(e => e.name === 'Vite')
  let ready = false
  // Cold .NET restore and initial npm installs can take several minutes.
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (exited) throw new Error('Local ' + mode + ' process exited before readiness')
    const checks = await Promise.all(required.map(entry => checkHttp(entry.url)))
    if (checks.every(Boolean)) { ready = true; break }
    if (attempt < 149) await delay(2000)
  }
  assert.ok(ready, mode + ': API/Vite readiness timeout (local HTTP 200 required)')
  assert.equal(startupFailed, false)
  if (mode === 'debug') {
    // Reuse the same real API/CORS/frontend HTML smoke as Docker up.
    await import('./dev-smoke.mjs')
  }
  console.log('DevEx host smoke PASS: ' + (mode === 'debug'
    ? 'native .NET watch + Vite, real PostgreSQL/Redis, API/CORS health'
    : 'native Windows npm/Vite subprocess + real loopback HTML'))
} finally {
  await terminate()
}
