import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const yaml = (name) => readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const job = (source, name) => source.split('\n  ' + name + ':\n')[1]?.split(/\n  [a-z0-9-]+:\n/)[0] ?? ''

test('production-affecting workflows only run from main even when dispatched manually', () => {
  for (const [file, jobs] of [
    ['deploy-pages.yml', ['build']],
    ['deploy-server.yml', ['build-and-push', 'deploy']],
    ['cleanup-merged-pr-branches.yml', ['prune']],
  ]) {
    const source = yaml(file)
    for (const name of jobs) {
      const body = job(source, name)
      assert.ok(body, file + ': missing job ' + name)
      assert.match(body, /if: .*github\.ref == 'refs\/heads\/main'/, file + ' ' + name)
    }
  }
})

test('Pages OIDC token permission is limited to the deploy job, not the build job', () => {
  const source = yaml('deploy-pages.yml')
  const topLevel = source.split('\njobs:\n')[0]
  assert.doesNotMatch(topLevel, /id-token:\s*write/)
  assert.doesNotMatch(job(source, 'build'), /id-token:\s*write/)
  assert.match(job(source, 'deploy'), /id-token:\s*write/)
})
