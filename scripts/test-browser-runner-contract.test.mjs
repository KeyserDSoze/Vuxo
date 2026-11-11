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
