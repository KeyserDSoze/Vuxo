#!/usr/bin/env node
// Real Linux CI smoke for the *development* stack. This script only accesses
// loopback endpoints, and never prints configuration/secrets or player data.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { parseLocalEnv, localHttpEndpoints, validateLocalEnv } from './dev-lib.mjs'

const env = parseLocalEnv(readFileSync(new URL('../docker/.env.local', import.meta.url), 'utf8'))
assert.deepEqual(validateLocalEnv(env), [])
const endpoints = localHttpEndpoints(env)

for (const { name, url } of endpoints) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' })
  assert.equal(response.status, 200, name + ' did not return HTTP 200')
  await response.body?.cancel()
}

const api = endpoints.find(entry => entry.name === 'API')
const vite = endpoints.find(entry => entry.name === 'Vite')
assert.ok(api && vite)
const apiBase = api.url.slice(0, -'/health'.length)
const viteBase = new URL(vite.url).origin

// Public provider discovery must respond with a real API payload and exact
// localhost CORS. No fake provider OAuth credentials are required.
const providers = await fetch(apiBase + '/api/auth/providers', {
  headers: { Origin: env.VUXO_ALLOWED_ORIGIN },
  redirect: 'error',
  signal: AbortSignal.timeout(5000),
})
assert.equal(providers.status, 200, 'Real API provider discovery failed')
assert.equal(providers.headers.get('access-control-allow-origin'),
  env.VUXO_ALLOWED_ORIGIN, 'Local-origin CORS mismatch')
assert.equal(providers.headers.get('access-control-allow-credentials'), 'true')
const providersJson = await providers.json()
assert.equal(typeof providersJson, 'object')
assert.ok(providersJson !== null)

// Vite must serve the real HTML app, not a different service on that port.
const web = await fetch(vite.url, { redirect: 'error', signal: AbortSignal.timeout(5000) })
assert.equal(web.status, 200, 'Vite dev entry not available')
assert.match(web.headers.get('content-type') ?? '', /text\/html/i)
const page = await web.text()
assert.match(page, /<html[\s>]/i)
assert.match(page, /<div id="root"/i)
assert.ok(new URL(vite.url).hostname === '127.0.0.1' && viteBase.startsWith('http://'))

console.log('DevEx runtime smoke PASS: real ASP.NET /health, local CORS provider discovery, Vite HTML on loopback')
