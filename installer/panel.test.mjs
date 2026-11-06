import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags, choicesFromFlags, panel, confirmExecution, Cancellation } from './panel.mjs';

const detection = () => ({ clis: [{ id: 'claude', state: 'ok' }, { id: 'codex', state: 'off-path' }, { id: 'agy', state: 'missing' }], project: { inRepository: true, root: '/repository', stacks: ['typescript', 'react'] } });
const choices = (args, d = detection()) => choicesFromFlags(parseFlags(args), d);

test('Flags match panel defaults with detected CLIs and opt-in Maestri', () => {
  assert.equal(parseFlags([]).command, 'install');
  assert.deepEqual(choices([]), { clis: ['claude', 'codex'], scope: 'global', maestri: false, hooks: true, ecc: { clis: [], hooks: false, stacks: [] }, impeccable: { clis: [], hooks: false } });
  assert.deepEqual(choices(['--clis=agy,agy', '--maestri']).clis, ['agy']);
  assert.equal(choices(['--maestri']).maestri, true);
  assert.deepEqual(choices(['--clis=none']).clis, []);
  assert.equal(parseFlags(['uninstall']).command, 'uninstall');
});

test('Flags accept separated or equals values and explicit third-party selections', () => {
  const r = choices(['--clis', 'codex', '--project', '--ecc', 'claude,codex', '--ecc-hooks', '--impeccable=agy', '--yes', '--json', '--dry-run', '--force']);
  assert.deepEqual(r, { clis: ['codex'], scope: 'project', root: '/repository', maestri: false, hooks: true,
    ecc: { clis: ['claude', 'codex'], hooks: true, stacks: ['typescript', 'react'] }, impeccable: { clis: ['agy'], hooks: false } });
  assert.deepEqual(choices(['--scope=project', '--ecc-clis=codex', '--stacks=python']).ecc.stacks, ['python']);
  assert.deepEqual(choices(['--scope=project', '--ecc=codex', '--ecc-stacks=']).ecc.stacks, []);
});

test('Invalid flags and inconsistent choices fail without opening the panel', () => {
  for (const args of [['--foo'], ['install', 'detect'], ['other'], ['--clis'], ['--clis=codex', '--cli=agy'], ['--project', '--scope=global']]) assert.throws(() => parseFlags(args));
  for (const args of [['--clis=other'], ['--scope=other'], ['--ecc-hooks'], ['--ecc=other'], ['--impeccable=other'], ['--ecc-stacks=python'], ['--project', '--ecc=codex', '--ecc-stacks=../outside']]) assert.throws(() => choices(args));
  assert.throws(() => choices(['--project'], { clis: [], project: { inRepository: false } }), /git repository/);
  assert.deepEqual(choices([], { clis: [{ id: 'codex', state: 'error' }], project: { inRepository: false } }).clis, []);
});

function fakePrompts(answers) {
  const calls = [];
  const prompts = { isCancel: (r) => typeof r === 'symbol' };
  for (const type of ['multiselect', 'select', 'confirm']) prompts[type] = async (options) => { calls.push({ type, ...options }); return answers.shift(); };
  return { prompts, calls };
}

test('Panel asks in order, suggests detected CLIs and returns the flags contract', async () => {
  const fake = fakePrompts([['codex'], 'project', true, true, ['claude'], false, ['typescript'], ['agy'], false]);
  const r = await panel(detection(), fake);
  assert.deepEqual(r, choices(['--clis=codex', '--project', '--maestri', '--ecc=claude', '--ecc-stacks=typescript', '--impeccable=agy']));
  assert.deepEqual(fake.calls.map((c) => c.type), ['multiselect', 'select', 'confirm', 'confirm', 'multiselect', 'confirm', 'multiselect', 'multiselect', 'confirm']);
  assert.deepEqual(fake.calls[0].initialValues, ['claude', 'codex']);
  assert.equal(fake.calls[1].initialValue, 'global');
  assert.equal(fake.calls[3].initialValue, true);
  assert.equal(fake.calls[5].initialValue, false);
  assert.deepEqual(fake.calls[6].initialValues, ['typescript', 'react']);
  assert.equal(fake.calls[8].initialValue, false);
  assert.deepEqual(fake.calls[4].options.map((o) => o.value), ['claude', 'codex']);
  assert.deepEqual(fake.calls[7].options.map((o) => o.value), ['claude', 'codex', 'agy']);
});

test('ECC flags reject Antigravity while Impeccable still accepts it', () => {
  for (const flag of ['--ecc=agy', '--ecc-clis=agy', '--ecc=claude,agy']) {
    assert.throws(() => choices([flag]), /Invalid ECC CLI/);
  }
  assert.deepEqual(choices(['--impeccable=agy']).impeccable.clis, ['agy']);
});

test('Outside git the panel offers global scope and skips unselected ECC questions', async () => {
  const fake = fakePrompts([['codex'], 'global', false, true, [], []]);
  const r = await panel({ clis: [], project: { inRepository: false } }, fake);
  assert.deepEqual(fake.calls[1].options.map((o) => o.value), ['global']);
  assert.equal(fake.calls.length, 6);
  assert.equal(r.ecc.hooks, false);
  assert.equal(r.impeccable.hooks, false);
});

test('Impeccable hooks are opt-in and require a selected CLI', async () => {
  assert.equal(choices(['--impeccable=codex']).impeccable.hooks, false);
  const flags = ['--clis=codex', '--impeccable=codex', '--impeccable-hooks'];
  assert.equal(choices(flags).impeccable.hooks, true);
  assert.equal(parseFlags(['--impeccable-hooks']).hasChoices, true);
  assert.throws(() => choices(['--impeccable-hooks']), /requires --impeccable/);
  const fake = fakePrompts([['codex'], 'global', false, true, [], ['codex'], true]);
  assert.deepEqual(await panel(detection(), fake), choices(flags));
  assert.equal(fake.calls.at(-1).initialValue, false);
});

test('Kit hooks default to enabled and can be disabled through flags or the panel', async () => {
  assert.equal(choices([]).hooks, true);
  assert.equal(choices(['--hooks']).hooks, true);
  assert.equal(choices(['--no-hooks']).hooks, false);
  assert.equal(parseFlags(['--hooks']).hasChoices, true);
  assert.throws(() => parseFlags(['--hooks', '--no-hooks']), /Use only/);
  const fake = fakePrompts([['codex'], 'global', false, false, [], []]);
  assert.equal((await panel(detection(), fake)).hooks, false);
});

test('Cancellation interrupts the panel and confirmation; confirmation defaults to no', async () => {
  const fake = fakePrompts([Symbol('cancel')]);
  await assert.rejects(panel(detection(), fake), Cancellation);
  assert.equal(fake.calls.length, 1);
  await assert.rejects(confirmExecution(fakePrompts([Symbol('cancel')])), Cancellation);
  const confirm = fakePrompts([false]);
  assert.equal(await confirmExecution(confirm), false);
  assert.equal(confirm.calls[0].initialValue, false);
});
