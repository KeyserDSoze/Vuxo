import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');

const requiredDirectories = [
  'src/backend',
  'src/frontend',
  'src/mobile',
  'src/shared',
  'tests',
  'docs',
  'docker',
  'infra'
];

for (const directory of requiredDirectories) {
  const path = join(root, directory);
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Missing repository foundation directory: ${directory}`);
  }
}

const requiredFiles = [
  'VERSION',
  'Vuxo.sln',
  'Directory.Build.props',
  'README.md',
  '.gitignore',
  '.github/workflows/ci.yml',
  'docker/compose.dev.yml',
  'src/frontend/package.json'
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    throw new Error(`Missing repository foundation file: ${file}`);
  }
}

const buildProps = readFileSync(join(root, 'Directory.Build.props'), 'utf8');
if (!/<TargetFramework>net10\.0<\/TargetFramework>/.test(buildProps)) {
  throw new Error('Directory.Build.props must target net10.0.');
}
if (!/<TreatWarningsAsErrors>true<\/TreatWarningsAsErrors>/.test(buildProps)) {
  throw new Error('Directory.Build.props must keep TreatWarningsAsErrors enabled.');
}

const frontendPackage = JSON.parse(readFileSync(join(root, 'src/frontend/package.json'), 'utf8'));
for (const dependency of ['react', '@mui/material', 'phaser']) {
  if (!frontendPackage.dependencies?.[dependency]) {
    throw new Error(`Frontend foundation dependency missing: ${dependency}`);
  }
}
if (!frontendPackage.devDependencies?.['@playwright/test']) {
  throw new Error('Frontend foundation dev dependency missing: @playwright/test');
}
for (const script of ['build', 'test:e2e']) {
  if (!frontendPackage.scripts?.[script]) {
    throw new Error(`Frontend package script missing: ${script}`);
  }
}

const devCompose = readFileSync(join(root, 'docker/compose.dev.yml'), 'utf8');
for (const service of ['postgres', 'redis']) {
  if (!new RegExp(`^\\s{2}${service}:`, 'm').test(devCompose)) {
    throw new Error(`docker/compose.dev.yml must define the ${service} service.`);
  }
}

const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
for (const command of [
  'dotnet build Vuxo.sln -c Release',
  'dotnet test Vuxo.sln -c Release',
  'npm run build',
  'npm run test:e2e',
  'verify-repository-foundation.mjs'
]) {
  if (!ci.includes(command)) {
    throw new Error(`CI foundation command missing: ${command}`);
  }
}

const readme = readFileSync(join(root, 'README.md'), 'utf8');
for (const marker of ['## Stack iniziale', '## Struttura', '## Versione e patch note']) {
  if (!readme.includes(marker)) {
    throw new Error(`README foundation section missing: ${marker}`);
  }
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const forbiddenTrackedFiles = tracked.filter((path) => {
  const segments = path.split('/');
  const name = segments.at(-1) ?? '';
  const tracksSecretDirectory = segments.slice(0, -1).some((segment) => segment === 'secrets');
  const tracksEnvironmentFile = name === '.env' || (name.startsWith('.env.') && name !== '.env.example');
  return tracksSecretDirectory || tracksEnvironmentFile;
});

if (forbiddenTrackedFiles.length > 0) {
  throw new Error(`Tracked local secret/environment files are forbidden: ${forbiddenTrackedFiles.join(', ')}`);
}

const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
for (const rule of ['.env', '.env.*', '!.env.example', 'secrets/']) {
  if (!gitignore.split(/\r?\n/).includes(rule)) {
    throw new Error(`.gitignore foundation rule missing: ${rule}`);
  }
}

console.log(
  `Repository foundation OK: ${requiredDirectories.length} canonical directories, .NET 10 warnings-as-errors, React/MUI/Phaser/Playwright, PostgreSQL/Redis Compose, CI and tracked-secret guards verified.`
);
