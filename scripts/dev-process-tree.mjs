import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

/** Kill only a locally spawned process tree, never a user/production service. */
export function signalLocalProcessTree(child, signal = 'SIGTERM', platform = process.platform) {
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) return
  if (platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore', shell: false, windowsHide: true,
    })
    killer.once('error', () => {})
    return
  }
  // Both the CLI and its host watch children are spawned in their own
  // POSIX process groups. Negative pid means the group, not just its leader.
  try { process.kill(-child.pid, signal) } catch (error) {
    if (error?.code !== 'ESRCH') throw error
    try { child.kill(signal) } catch { /* already stopped */ }
  }
}

/** Timers must be aborted when close wins, or the test runner stays open. */
async function waitForClose(close, timeoutMs) {
  const abort = new AbortController()
  try {
    return await Promise.race([
      close,
      delay(timeoutMs, false, { signal: abort.signal }).catch(() => false),
    ])
  } finally {
    abort.abort()
  }
}

/**
 * Close inherited stdout/stderr pipes as well as the direct child. A watch
 * grandchild may keep those pipes open after the parent has exited, causing
 * Node's event loop to outlive a successful smoke and hit the CI timeout.
 */
export async function stopLocalProcessTree(child, {
  platform = process.platform, graceMs = 5000, killWaitMs = 1500,
} = {}) {
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) return
  const close = new Promise(resolve => child.once('close', () => resolve(true)))
  try {
    signalLocalProcessTree(child, 'SIGINT', platform)
    const clean = await waitForClose(close, graceMs)
    if (!clean) {
      signalLocalProcessTree(child, 'SIGKILL', platform)
      await waitForClose(close, killWaitMs)
    }
  } finally {
    // Even a now-dead CLI can leave inherited pipes held by grandchildren.
    // Don't allow a completed smoke to stay alive because of stream handles.
    child.stdout?.destroy()
    child.stderr?.destroy()
    child.stdin?.destroy()
  }
}
