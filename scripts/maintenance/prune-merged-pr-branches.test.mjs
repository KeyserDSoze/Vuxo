import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, CANDIDATES } from './prune-merged-pr-branches.mjs';
const repo = 'KeyserDSoze/Vuxo';
const candidate = { branch: 'feature/merged', sha: 'a'.repeat(40), pr: 77 };
const branches = [{ name: candidate.branch, protected: false, commit: { sha: candidate.sha } }];
const merged = [{ number: 77, merged_at: '2026-11-08T11:00:00Z',
  head: { ref: candidate.branch, sha: candidate.sha, repo: { full_name: repo } } }];
test('exact unchanged merged head eligible', () => {
  assert.equal(classify(candidate, branches, merged, [], repo), 'eligible');
});
test('never delete main or protected refs', () => {
  assert.equal(classify({ ...candidate, branch: 'main' }, branches, merged, [], repo), 'unsafe_branch');
  assert.equal(classify(candidate, [{ ...branches[0], protected: true }], merged, [], repo), 'protected');
});
test('unmerged and other repository PRs not eligible', () => {
  assert.equal(classify(candidate, branches, [{ ...merged[0], merged_at: null }], [], repo), 'not_exact_merged_pr_head');
  assert.equal(classify(candidate, branches, [{ ...merged[0], head: {
    ...merged[0].head, repo: { full_name: 'other/repo' } } }], [], repo), 'not_exact_merged_pr_head');
});
test('branch moved after merge is not eligible', () => {
  assert.equal(classify(candidate, [{ ...branches[0], commit: { sha: 'b'.repeat(40) } }], merged, [], repo), 'branch_changed');
});
test('either head or base of an open PR forbids deletion', () => {
  assert.equal(classify(candidate, branches, merged, [{ head: { ref: candidate.branch }, base: { ref: 'main' } }], repo), 'used_by_open_pr');
  assert.equal(classify(candidate, branches, merged, [{ head: { ref: 'other' }, base: { ref: candidate.branch } }], repo), 'used_by_open_pr');
});
test('missing, unsafe and non-matching refs are skipped', () => {
  assert.equal(classify(candidate, [], merged, [], repo), 'branch_missing');
  assert.equal(classify({ ...candidate, branch: '../main' }, branches, merged, [], repo), 'unsafe_branch');
  assert.equal(classify(candidate, branches, [], [], repo), 'not_exact_merged_pr_head');
});
test('audited manifest is unique, exact and excludes main', () => {
  assert.equal(CANDIDATES.length, 33);
  assert.equal(new Set(CANDIDATES.map(x => x.branch)).size, CANDIDATES.length);
  assert.ok(CANDIDATES.every(x => x.branch !== 'main' && /^[a-f0-9]{40}$/.test(x.sha)));
});
