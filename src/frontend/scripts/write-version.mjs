import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const version = (await readFile(resolve(root, 'VERSION'), 'utf8')).trim();
const payload = {
  version,
  commit: process.env.GITHUB_SHA ?? 'local',
  buildDateUtc: new Date().toISOString()
};
await writeFile(resolve(here, '../public/version.json'), `${JSON.stringify(payload, null, 2)}\n`);
