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
import { stopLocalProcessTree } from './dev-process-tree.mjs'
import {
  hostCommandArguments, hostRuntimeEnvironment, localHostEnvironment,
  localHttpEndpoints, parseLocalEnv, validateLocalEnv, classifyHostDebugFailure,
  classifyHostDebugStage,
} from './dev-lib.mjs'

const mode = process.argv[2]
if (!['debug', 'debug-observability', 'frontend'].includes(mode) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/dev-host-smoke.mjs debug|debug-observability|frontend')
}
const nativeDebug = mode !== 'frontend'
const observability = mode === 'debug-observability'
const config = parseLocalEnv(readFileSync(new URL('../docker/.env.local', import.meta.url), 'utf8'))
assert.deepEqual(validateLocalEnv(config), [])
const root = fileURLToPath(new URL('../', import.meta.url))
const frontend = fileURLToPath(new URL('../src/frontend/', import.meta.url))
const host = hostRuntimeEnvironment(config)
const windowsNpm = process.platform === 'win32' && mode === 'frontend'
const command = nativeDebug ? process.execPath : (windowsNpm ? 'npm.cmd' : 'npm')
const args = nativeDebug
  ? ['scripts/dev.mjs', 'debug', ...(observability ? ['--observability'] : [])]
  : hostCommandArguments(config, 'frontend')

const processChild = spawn(command, args, {
  cwd: nativeDebug ? root : frontend,
  env: nativeDebug ? process.env : localHostEnvironment(process.env, host.frontend),
  shell: windowsNpm, windowsHide: true,
  detached: process.platform !== 'win32',
  // Collect bounded private logs ONLY in memory, classify by fixed patterns;
  // never print subprocess output to CI artifacts or terminal.
  stdio: ['ignore', 'pipe', 'pipe'],
})
let privateDiagnostic = ''
for (const stream of [processChild.stdout, processChild.stderr]) {
  stream.on('data', chunk => {
    privateDiagnostic = (privateDiagnostic + String(chunk)).slice(-8192)
  })
}
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
  await stopLocalProcessTree(processChild, { graceMs: 5000, killWaitMs: 1500 })
}

try {
  const endpointList = localHttpEndpoints(config)
  const required = nativeDebug ? endpointList : endpointList.filter(e => e.name === 'Vite')
  let ready = false
  let pending = required.map(entry => entry.name)
  // A fixed attempt count can overrun the CI step timeout when each HTTP
  // request takes 2.2 seconds. Account for those requests in a real deadline.
  const deadline = Date.now() + 7 * 60_000
  while (Date.now() < deadline) {
    if (exited) throw new Error('Local ' + mode + ' process exited before readiness: ' +
      (startupFailed ? 'cannot spawn host subprocess' : classifyHostDebugFailure(privateDiagnostic)))
    const checks = await Promise.all(required.map(entry => checkHttp(entry.url)))
    pending = required.filter((entry, index) => !checks[index]).map(entry => entry.name)
    if (pending.length === 0) { ready = true; break }
    if (Date.now() < deadline) await delay(2000)
  }
  assert.ok(ready, mode + ': HTTP readiness timeout; unavailable: ' + pending.join(', ') +
    '; phase: ' + classifyHostDebugStage(privateDiagnostic))
  assert.equal(startupFailed, false)
  if (nativeDebug) {
    // Reuse the real API/CORS/frontend HTML smoke; the opt-in variant also
    // verifies collector health and authenticated admin exporter metadata.
    await import('./dev-smoke.mjs')
    if (observability) await import('./dev-otel-smoke.mjs')
  }
  console.log('DevEx host smoke PASS: ' + (nativeDebug
    ? 'native .NET watch + Vite, real PostgreSQL/Redis, API/CORS health' +
      (observability ? ', local OTLP collector and admin exporter' : '')
    : 'native Windows npm/Vite subprocess + real loopback HTML'))
} finally {
  await terminate()
}
