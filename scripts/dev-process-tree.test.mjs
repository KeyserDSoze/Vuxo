import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { signalLocalProcessTree, stopLocalProcessTree } from './dev-process-tree.mjs'

test('invalid child pid does not signal a process group', () => {
  assert.doesNotThrow(() => signalLocalProcessTree({ pid: 0 }))
  assert.doesNotThrow(() => signalLocalProcessTree({ pid: -1 }))
  assert.doesNotThrow(() => signalLocalProcessTree(null))
})

test('stop closes a detached host tree even when a grandchild inherits pipes', { timeout: 8000 }, async () => {
  // A grandchild ignores graceful interrupts and inherits stdout/stderr.
  // Without bounded SIGKILL and destroyed pipes, process.close hangs.
  const script = [
    "const {spawn} = require('node:child_process')",
    "spawn(process.execPath, ['-e', 'process.on(\"SIGINT\",()=>{});setInterval(()=>{},1000)'], {stdio: ['ignore','inherit','inherit']})",
    'setInterval(()=>{},1000)',
  ].join(';')
  const child = spawn(process.execPath, ['-e', script], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  try {
    await delay(250)
    const start = Date.now()
    await stopLocalProcessTree(child, { graceMs: 350, killWaitMs: 600 })
    assert.ok(Date.now() - start < 3500, 'process tree must stop within bounded time')
    assert.ok(child.stdout.destroyed)
    assert.ok(child.stderr.destroyed)
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      signalLocalProcessTree(child, 'SIGKILL')
    }
  }
})
