import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The hosted-browser jobs must run Chromium for real, but should not need
// unattended apt installs to begin tests while Ubuntu 26 runner rollout
// and transient repository DNS failures are ongoing.
const yaml = (name) => readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8')

test('browser workflows pin Ubuntu 24.04 and do not run apt during Chromium setup', () => {
  const jobs = [
    ['ci.yml', 'frontend:', 'npm run test:e2e'],
    ['ux-visual-review.yml', 'screenshots:', 'npx playwright test'],
    ['portal-live-e2e.yml', 'portal-live:', 'npx playwright test'],
  ]
  for (const [file, job, testCommand] of jobs) {
    const source = yaml(file)
    const part = source.split('  ' + job + '\n')[1]
    assert.ok(part, file + ': missing ' + job)
    assert.match(part, /runs-on: ubuntu-24\.04/, file)
    assert.match(part, /npx playwright install chromium/, file)
    assert.doesNotMatch(part, /playwright install --with-deps|apt-get install/, file)
    assert.ok(part.includes(testCommand), file + ': browser tests must remain enabled')
    assert.doesNotMatch(part, /continue-on-error: true/, file)
  }
})


test('visual screenshot workflow tracks world input-focus and covers game viewport', () => {
  const source = yaml('ux-visual-review.yml').replace(/\r\n/g, '\n')
  const watchList = source.split('    paths:\n')[1]?.split('\n\npermissions:')[0]
  assert.ok(watchList, 'visual workflow must declare push paths')
  for (const path of [
    'src/frontend/src/game/GameCanvas.tsx',
    'src/frontend/src/game/game.css',
    'src/frontend/src/game/WorldInputFocus.ts',
    'src/frontend/tests/game-viewport.spec.ts',
    'src/frontend/tests/multiplayer.spec.ts',
  ]) {
    assert.ok(watchList.includes('      - ' + path + '\n'),
      'visual workflow must trigger for ' + path)
  }
  const command = source.split('\n').find(line => line.includes('run: npx playwright test '))
  assert.ok(command, 'visual workflow must execute Playwright')
  assert.match(command, /tests\/game-viewport\.spec\.ts/,
    'visual evidence must include mobile and desktop HUD→canvas focus regression')
})
