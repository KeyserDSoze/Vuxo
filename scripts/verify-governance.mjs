import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '../..');
const requiredFiles = [
  'AGENTS.md',
  'docs/engineering/chat-handoff-prompt.md',
  'docs/engineering/development-ledger.md',
  'docs/engineering/issue-lifecycle.md',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.agents/skills/vuxo-issue-lifecycle/SKILL.md'
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Missing governance file: ${file}`);
  }
}

const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
const ledger = readFileSync(resolve(root, 'docs/engineering/development-ledger.md'), 'utf8');
if (!ledger.includes(`## Versione corrente: ${version}`)) {
  throw new Error(`Development ledger does not declare current version ${version}`);
}

const handoffDocument = readFileSync(resolve(root, 'docs/engineering/chat-handoff-prompt.md'), 'utf8').replace(/\r\n/g, '\n');
const match = handoffDocument.match(/```text\n([\s\S]*?)\n```/);
if (!match) {
  throw new Error('Handoff prompt must contain exactly a fenced text block that can be copied to a new chat.');
}

const promptLength = [...match[1]].length;
if (promptLength > 8000) {
  throw new Error(`Handoff prompt is ${promptLength} characters; maximum allowed is 8000.`);
}

for (const formPath of ['.github/ISSUE_TEMPLATE/feature.yml', '.github/ISSUE_TEMPLATE/bug.yml']) {
  const form = readFileSync(resolve(root, formPath), 'utf8');
  for (const key of ['name:', 'description:', 'body:']) {
    if (!form.includes(key)) {
      throw new Error(`${formPath} is missing required Issue Form key ${key}`);
    }
  }
  if (/^summary:/m.test(form)) {
    throw new Error(`${formPath} contains unsupported Issue Form metadata key summary.`);
  }
}

console.log(`Governance metadata OK. Handoff prompt length: ${promptLength}/8000 characters.`);
