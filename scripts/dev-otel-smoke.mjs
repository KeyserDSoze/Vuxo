#!/usr/bin/env node
// Read-only local collector probe + Development-only mock admin metadata check.
// Only loopback requests; never print mock JWT, telemetry payloads or passwords.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { localOtelHealthEndpoint, parseLocalEnv, validateLocalEnv, localHttpEndpoints } from './dev-lib.mjs'

const config = parseLocalEnv(readFileSync(new URL('../docker/.env.local', import.meta.url), 'utf8'))
assert.deepEqual(validateLocalEnv(config), [])
const health = localOtelHealthEndpoint(config)
const collectorResponse = await fetch(health.url, { redirect: 'error', signal: AbortSignal.timeout(5000) })
assert.equal(collectorResponse.status, 200, 'Opt-in collector health did not return 200')
await collectorResponse.body?.cancel()
const apiUrl = localHttpEndpoints(config).find(x => x.name === 'API').url.replace(/\/health$/, '')
const login = await fetch(apiUrl + '/api/auth/mock', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ subject: 'devex-otel-admin', displayName: 'devex-otel-admin', role: 'Administrator' }),
  redirect: 'error',
  signal: AbortSignal.timeout(5000),
})
assert.equal(login.status, 200, 'Development mock admin authentication failed')
const payload = await login.json()
assert.equal(typeof payload.accessToken, 'string', 'No local mock token was issued')
const res = await fetch(apiUrl + '/api/admin/observability', {
  headers: { Authorization: 'Bearer ' + payload.accessToken },
  redirect: 'error',
  signal: AbortSignal.timeout(5000),
})
assert.equal(res.status, 200, 'Dev admin observability metadata failed')
const body = await res.json()
assert.equal(body.enabled, true, 'Local observability opt-in not active')
assert.equal(body.exporterConfigured, true, 'Local OTLP exporter not configured')
assert.equal(Object.hasOwn(body, 'otlpEndpoint'), false, 'OTLP endpoint leaked in admin metadata')
console.log('DevEx local OpenTelemetry PASS: loopback collector health + enabled, safe admin exporter metadata')
