#!/usr/bin/env node
// Verify that the GitHub Pages artifact includes the SPA, the separate
// Microsoft MSAL v5 bridge and root-relative files for the custom domain.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function assertExists(path, description) {
  if (!existsSync(path)) throw new Error('Pages artifact missing ' + description);
}

export function verifyPagesArtifact(dist = join(root, 'src/frontend/dist')) {
  const indexPath = join(dist, 'index.html');
  const bridgePath = join(dist, 'redirect.html');
  const versionPath = join(dist, 'version.json');
  assertExists(indexPath, 'index.html');
  assertExists(bridgePath, 'redirect.html');
  assertExists(versionPath, 'version.json');

  const index = readFileSync(indexPath, 'utf8');
  const bridge = readFileSync(bridgePath, 'utf8');
  const version = JSON.parse(readFileSync(versionPath, 'utf8'));
  if (!/id=["']root["']/.test(index)) throw new Error('Pages SPA root is missing');
  if (!/<title>\s*Vuxo Microsoft sign-in\s*<\/title>/i.test(bridge)) {
    throw new Error('MSAL5 redirect bridge is missing or incorrect');
  }
  if (/id=["']root["']/.test(bridge)) {
    throw new Error('MSAL5 redirect must not load the SPA');
  }
  if (typeof version.version !== 'string' || !version.version
      || typeof version.commit !== 'string' || !/^[a-f0-9]{40}$/.test(version.commit)) {
    throw new Error('Pages version metadata missing an immutable commit');
  }

  for (const [filename, html] of [['index.html', index], ['redirect.html', bridge]]) {
    const urls = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
      .map(match => match[1]);
    if (!urls.some(url => /^\/assets\/.+\.js$/.test(url))) {
      throw new Error(filename + ' must contain a root-relative JavaScript entry');
    }
    for (const url of urls) {
      if (!url.startsWith('/assets/')) {
        throw new Error(filename + ' contains an invalid non-root script URL');
      }
      assertExists(join(dist, url.slice(1)), filename + ' script ' + url);
    }
  }

  const assetDir = join(dist, 'assets');
  assertExists(assetDir, 'assets directory');
  if (!readdirSync(assetDir).some(name => name.endsWith('.js'))) {
    throw new Error('Pages assets contain no JavaScript');
  }
  return version.commit;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('GitHub Pages artifact OK at commit ' + verifyPagesArtifact());
}
