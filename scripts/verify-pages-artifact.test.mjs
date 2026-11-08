import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPagesArtifact } from './verify-pages-artifact.mjs';

function withArtifact(callback) {
  const dist = mkdtempSync(join(tmpdir(), 'vuxo-pages-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'),
    '<html><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></html>');
  writeFileSync(join(dist, 'redirect.html'),
    '<html><title>Vuxo Microsoft sign-in</title><script type="module" src="/assets/redirect-abc.js"></script></html>');
  writeFileSync(join(dist, 'version.json'),
    JSON.stringify({ version: '0.0.1', commit: 'a'.repeat(40), buildDateUtc: '2026-11-08T00:00:00Z' }));
  writeFileSync(join(dist, 'assets/index-abc.js'), '/* SPA */');
  writeFileSync(join(dist, 'assets/redirect-abc.js'), '/* Bridge */');
  try { callback(dist); } finally { rmSync(dist, { recursive: true, force: true }); }
}

test('Pages artifact includes the SPA and the standalone MSAL bridge', () => {
  withArtifact(dist => assert.equal(verifyPagesArtifact(dist), 'a'.repeat(40)));
});

test('Pages artifact rejects missing MSAL popup bridge', () => {
  withArtifact(dist => {
    rmSync(join(dist, 'redirect.html'));
    assert.throws(() => verifyPagesArtifact(dist), /missing redirect.html/);
  });
});

test('Pages artifact rejects incorrect asset base path', () => {
  withArtifact(dist => {
    writeFileSync(join(dist, 'index.html'),
      '<div id="root"></div><script src="/Vuxo/assets/index-abc.js"></script>');
    assert.throws(() => verifyPagesArtifact(dist), /root-relative JavaScript entry/);
  });
});

test('Pages artifact rejects missing asset and wrong version', () => {
  withArtifact(dist => {
    rmSync(join(dist, 'assets/redirect-abc.js'));
    assert.throws(() => verifyPagesArtifact(dist), /script \/assets\/redirect-abc.js/);
    writeFileSync(join(dist, 'assets/redirect-abc.js'), '/* Bridge */');
    writeFileSync(join(dist, 'version.json'), JSON.stringify({ version: '0.0.1', commit: 'old' }));
    assert.throws(() => verifyPagesArtifact(dist), /immutable commit/);
  });
});

test('Pages workflow publishes every main push, not only frontend file changes', () => {
  const workflow = readFileSync(resolve(fileURLToPath(new URL('../.github/workflows/deploy-pages.yml', import.meta.url))), 'utf8');
  const trigger = workflow.match(/\n  push:\n([\s\S]*?)\n  workflow_dispatch:/);
  assert.ok(trigger, 'Main push trigger must be present');
  assert.match(trigger[1], /branches:\s*\[main\]/);
  assert.doesNotMatch(trigger[1], /paths(?:-ignore)?:/);
});
