import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflowDirectory = new URL('../.github/workflows/', import.meta.url)
const yaml = (name) => readFileSync(new URL(name, workflowDirectory), 'utf8').replace(/\r\n/g, '\n')
const job = (source, name) => source.split('\n  ' + name + ':\n')[1]?.split(/\n  [a-z0-9-]+:\n/)[0] ?? ''

test('every third-party action is pinned to a full commit SHA', () => {
  for (const file of readdirSync(workflowDirectory).filter(name => name.endsWith('.yml'))) {
    for (const [, reference] of yaml(file).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
      if (reference.startsWith('./')) continue
      assert.match(reference, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, file + ': ' + reference + ' must be pinned to a SHA')
    }
  }
})

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
