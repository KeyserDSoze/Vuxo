import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');

const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!semver.test(version)) {
  throw new Error(`VERSION is not a valid semantic version: ${version}`);
}

const frontendPackage = JSON.parse(readFileSync(join(root, 'src/frontend/package.json'), 'utf8'));
if (frontendPackage.version !== version) {
  throw new Error(`Version mismatch: VERSION=${version}, src/frontend/package.json=${frontendPackage.version}`);
}

const releaseGuide = join(root, 'docs', 'engineering', 'release-versioning.md');
if (!existsSync(releaseGuide)) {
  throw new Error('Missing release/versioning convention: docs/engineering/release-versioning.md');
}

const patchNote = join(root, 'docs', 'patch-notes', `${version}.md`);
if (!existsSync(patchNote)) {
  throw new Error(`Missing patch note for ${version}: docs/patch-notes/${version}.md`);
}

console.log(`Release metadata OK for Vuxo ${version}`);
