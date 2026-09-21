import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const expectedVersion = readFileSync(join(root, 'VERSION'), 'utf8').trim();
const expectedCommit = process.env.GITHUB_SHA ?? 'local';
const payload = JSON.parse(readFileSync(join(root, 'src/frontend/dist/version.json'), 'utf8'));

if (payload.version !== expectedVersion) {
  throw new Error(`Built frontend version mismatch: expected ${expectedVersion}, got ${payload.version}`);
}
if (payload.commit !== expectedCommit) {
  throw new Error(`Built frontend commit mismatch: expected ${expectedCommit}, got ${payload.commit}`);
}
if (typeof payload.buildDateUtc !== 'string' || Number.isNaN(Date.parse(payload.buildDateUtc))) {
  throw new Error(`Built frontend buildDateUtc is not a valid ISO date: ${payload.buildDateUtc}`);
}

console.log(`Built frontend metadata OK: ${payload.version} @ ${payload.commit} (${payload.buildDateUtc})`);
