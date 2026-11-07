import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingPrerequisites, realTools } from './team-checks.mjs';

const manifest = {
  presets: [{ name: 'Lead', command: 'claude --model claude-opus-5-5 --add-dir ../../..', maestro: true }],
  agents: [
    { name: 'A', command: 'codex --no-daemon -m gpt-x -c model_reasoning_effort=low' },
    { name: 'B', command: 'agy --model gemini-x --effort low' },
    { name: 'C', preset: 'Lead' },
  ],
};
const codexList = (...slugs) => JSON.stringify({ models: slugs.map((slug) => ({ slug })) });
const agyList = (...ids) => `Fetching available models...\n${ids.map((id) => `${id}\tName of ${id}`).join('\n')}\n`;
const tools = (over = {}) => ({
  onPath: () => true,
  codexModels: () => codexList('gpt-x'),
  agyModels: () => agyList('gemini-x'),
  claudePlugins: () => 'Installed plugins:\n\n  ❯ ecc@ecc\n    Status: enabled\n',
  ...over,
});

test('nothing is missing when the CLIs, models and ECC are there', () => {
  assert.deepEqual(missingPrerequisites(manifest, tools()), []);
});

test('every missing item is listed together, and a missing CLI is not also probed for models', () => {
  const problems = missingPrerequisites(manifest, tools({
    onPath: (bin) => bin !== 'agy',
    codexModels: () => codexList('other'),
    claudePlugins: () => 'Installed plugins:\n\n  ❯ impeccable@impeccable\n',
  }));
  assert.deepEqual(problems, [
    'agy is not on PATH',
    'agent "A": model "gpt-x" is not in codex debug models',
    'ECC is not installed in Claude Code (claude plugin list shows no ecc@): the Team Maestro role uses /ecc:plan',
  ]);
});

test('a model missing from agy models is named with its agent; Claude models are not checked offline', () => {
  const problems = missingPrerequisites(manifest, tools({ agyModels: () => agyList('gemini-y') }));
  assert.deepEqual(problems, ['agent "B": model "gemini-x" is not in agy models']);
});

test('a CLI that fails when asked for its models or plugins is reported once, not thrown', () => {
  const broken = (what) => () => {
    throw Object.assign(new Error('exit 1'), { stderr: Buffer.from(`${what} broke\nmore`) });
  };
  const two = { ...manifest, agents: [...manifest.agents, { name: 'D', command: 'codex -m gpt-x' }] };
  const problems = missingPrerequisites(two, tools({ codexModels: broken('codex'), claudePlugins: broken('claude') }));
  assert.deepEqual(problems, [
    'could not run codex debug models: codex broke', 'could not run claude plugin list: claude broke']);
});

test('--roles-only needs only the maestri binary', () => {
  const only = tools({ onPath: (bin) => bin === 'maestri', codexModels: () => assert.fail('not probed') });
  assert.deepEqual(missingPrerequisites(manifest, only, { rolesOnly: true }), []);
  assert.deepEqual(missingPrerequisites(manifest, tools({ onPath: () => false }), { rolesOnly: true }),
    ['maestri is not on PATH']);
});

test('real PATH lookup finds a runnable file by name or path and rejects the rest', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-path-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Windows has no execute bit: a file is runnable there by its PATHEXT extension, so the rejected one has none.
  const runnable = path.join(dir, process.platform === 'win32' ? 'fake-cli.cmd' : 'fake-cli');
  fs.writeFileSync(runnable, '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'not-runnable'), 'x', { mode: 0o644 });
  const { onPath } = realTools({ env: { PATH: dir, PATHEXT: '.CMD;.EXE' } });
  assert.equal(onPath('fake-cli'), true);
  assert.equal(onPath(runnable), true);
  assert.equal(onPath('not-runnable'), false);
  assert.equal(onPath('absent'), false);
});
