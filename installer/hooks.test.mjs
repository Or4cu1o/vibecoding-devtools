import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan } from './plan.mjs';
import { hookActions, CODEX_HOOK_APPROVAL } from './hooks.mjs';
import { execute, uninstall } from './execute.mjs';
import { readState, statePath } from './state.mjs';
import { main, summarizePlan } from './cli.mjs';
import { jsonMergeSnapshot, jsonMergeSituation, mergeJson } from './json-merge.mjs';

const kit = fileURLToPath(new URL('../', import.meta.url));
const choices = (extra = {}) => ({ clis: ['claude', 'codex', 'agy'], scope: 'global', maestri: false,
  ecc: { clis: [] }, impeccable: { clis: [] }, ...extra });
function environment(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-hooks-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = { home: path.join(root, 'home with spaces'), project: path.join(root, 'project'), kit };
  const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
  const actions = (extra) => hookActions(choices(extra), paths);
  return { ...paths, write, actions };
}
const registrations = (actions) => actions.filter((a) => a.type === 'json-merge');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

test('Hook plans use global CLI schemas in either scope and copy each runtime file once', (t) => {
  const env = environment(t);
  for (const scope of ['global', 'project']) {
    const actions = buildPlan(choices({ scope }), {}, env);
    const scripts = actions.filter((a) => a.description.startsWith('Kit hook script:'));
    assert.equal(scripts.length, 3);
    assert.equal(new Set(scripts.map((a) => a.destination)).size, scripts.length);
    assert.ok(registrations(actions).every((a) => a.destination.startsWith(env.home + path.sep)));
    const [agy, claude, codex] = registrations(actions);
    assert.match(claude.destination, /settings\.json$/);
    assert.equal(claude.entries[0].matcher, 'Bash|PowerShell');
    assert.equal(codex.entries[0].matcher, 'Bash');
    const hook = codex.entries[0].hooks[0];
    assert.equal(hook.commandWindows, hook.command);
    assert.equal(hook.timeout, 30);
    assert.match(hook.command, /^node ".*home with spaces.*secret-scan\.mjs"$/);
    assert.deepEqual(Object.keys(agy.entries), ['vibecoding-secret-scan']);
    assert.equal(agy.entries['vibecoding-secret-scan'].enabled, true);
    assert.equal(agy.entries['vibecoding-secret-scan'].PreToolUse[0].matcher, 'run_command');
  }
  assert.deepEqual(env.actions({ hooks: false }), []);
  assert.deepEqual(env.actions({ clis: [] }), []);
  assert.equal(registrations(env.actions({ maestri: true }))[0].entries['vibecoding-maestri-protocol'].enabled, true);
  assert.equal(fs.existsSync(env.home), false);
});

test('Hook installation copies runtime scripts and helpers without tests or documentation', (t) => {
  const env = environment(t);
  const actions = env.actions().filter((a) => a.type === 'copy');
  assert.deepEqual(actions.map((a) => path.relative(path.join(kit, 'hooks'), a.source).replace(/\\/g, '/')),
    ['maestri-protocol.mjs', 'secret-scan.mjs', 'lib/io.mjs']);
  assert.equal(execute(actions, env).ok, true);
  const installed = path.join(env.home, '.vibecoding-devtools', 'hooks');
  assert.deepEqual(fs.readdirSync(installed).sort(), ['lib', 'maestri-protocol.mjs', 'secret-scan.mjs']);
  assert.deepEqual(fs.readdirSync(path.join(installed, 'lib')), ['io.mjs']);
  for (const action of actions) assert.deepEqual(fs.readFileSync(action.destination), fs.readFileSync(action.source));
});

test('Installation and uninstall preserve user JSON bytes, BOM, CRLF and shared hook groups', (t) => {
  const env = environment(t);
  const actions = env.actions({ maestri: true });
  const originals = new Map();
  for (const action of registrations(actions)) {
    const text = action.cli === 'agy' ? '\uFEFF{\r\n\t"user-hook" : {"enabled": true,"number":1e+02}\r\n}\r\n'
      : '\uFEFF{\r\n\t"permissions" : {"allow":["Read"],"number":1e+02},\r\n'
        + '\t"hooks": { "PreToolUse" : [{"matcher":"Bash","hooks":[{"type":"command","command":"user command"}]}] }\r\n}\r\n';
    env.write(action.destination, text);
    originals.set(action.destination, text);
  }
  const preview = execute(actions, { home: env.home, dryRun: true });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(fs.existsSync(statePath(env.home)), false);
  const result = execute(actions, env);
  assert.equal(result.ok, true, JSON.stringify(result));
  for (const [destination, original] of originals) {
    assert.ok(fs.readFileSync(destination, 'utf8').includes('1e+02'));
    assert.equal(fs.readFileSync(destination, 'utf8').charCodeAt(0), 0xFEFF);
    assert.ok(original.startsWith('\uFEFF'));
  }
  assert.equal(execute(actions, env).actions.every((a) => a.status === 'same' || a.type === 'copy'), true);
  assert.equal(uninstall(env).ok, true);
  for (const [destination, original] of originals) assert.equal(fs.readFileSync(destination, 'utf8'), original);
  assert.deepEqual(readState(env).items, []);
});

test('Maestri selection updates only owned hooks and repeated plans become identical', (t) => {
  const env = environment(t);
  assert.equal(execute(env.actions(), env).ok, true);
  for (const action of registrations(env.actions({ maestri: true }))) {
    const previous = readState(env).items.find((i) => i.destination === action.destination);
    assert.equal(jsonMergeSituation(fs.readFileSync(action.destination), action, previous), 'update');
  }
  assert.equal(execute(env.actions({ maestri: true }), env).ok, true);
  assert.ok(registrations(buildPlan(choices({ maestri: true }), {}, env)).every((a) => a.situation === 'same'));
  assert.equal(execute(env.actions(), env).ok, true);
  for (const action of registrations(env.actions())) {
    assert.doesNotMatch(fs.readFileSync(action.destination, 'utf8'), /maestri-protocol/);
    assert.equal(jsonMergeSnapshot(fs.readFileSync(action.destination), action).count, 1);
  }
  assert.equal(uninstall(env).ok, true);
  for (const action of registrations(env.actions())) assert.equal(fs.existsSync(action.destination), false);
});

test('Malformed JSON, non-UTF-8 and incompatible hook containers conflict even with force', (t) => {
  const env = environment(t);
  const action = registrations(env.actions({ clis: ['claude'] }))[0];
  for (const invalid of [Buffer.from('{'), Buffer.from([0xFF]), Buffer.from('{}', 'utf16le'),
    Buffer.from('[]'), Buffer.from('{"hooks":false}'), Buffer.from('{"hooks":{"PreToolUse":{}}}'),
    Buffer.from('{"hooks":{},"hooks":{}}')]) {
    env.write(action.destination, invalid);
    const plan = buildPlan(choices({ clis: ['claude'] }), {}, env);
    assert.equal(registrations(plan)[0].situation, 'conflict');
    for (const force of [false, true]) {
      const result = execute([action], { home: env.home, force });
      assert.equal(result.ok, false);
      assert.equal(result.conflicts.length, 1);
      assert.deepEqual(fs.readFileSync(action.destination), invalid);
    }
    assert.equal(fs.existsSync(statePath(env.home)), false);
  }
});

test('Unknown or modified kit entries conflict; force replaces only kit entries', (t) => {
  const env = environment(t);
  for (const action of registrations(env.actions())) {
    const installed = mergeJson(null, action).content.toString();
    const modified = installed.replace(/"timeout": 30/g, '"timeout": 99');
    env.write(action.destination, modified);
    assert.equal(jsonMergeSituation(Buffer.from(modified), action), 'conflict');
    assert.equal(execute([action], env).conflicts.length, 1);
    assert.equal(execute([action], { home: env.home, force: true }).ok, true);
    const before = json(action.destination);
    before.userSetting = { keep: true };
    env.write(action.destination, JSON.stringify(before, null, 2));
    // Reformatting kit entries is a local edit, just like editing a managed block.
    const modifiedAgain = fs.readFileSync(action.destination, 'utf8').replace(/"timeout": 30/g, '"timeout": 77');
    env.write(action.destination, modifiedAgain);
  }
  const result = uninstall(env);
  assert.equal(result.warnings.filter((w) => /Modified JSON entries/.test(w.reason)).length, 3);
  for (const action of registrations(env.actions())) {
    assert.equal(json(action.destination).userSetting.keep, true);
    assert.match(fs.readFileSync(action.destination, 'utf8'), /"timeout": 77/);
  }
});

test('Unrelated user edits remain intact on update and uninstall', (t) => {
  const env = environment(t);
  for (const action of registrations(env.actions())) env.write(action.destination, '{"user":1e3}\n');
  assert.equal(execute(env.actions(), env).ok, true);
  for (const action of registrations(env.actions())) {
    const text = fs.readFileSync(action.destination, 'utf8').replace('"user":1e3', '"user":2e3');
    env.write(action.destination, text);
  }
  assert.equal(execute(env.actions({ maestri: true }), env).ok, true);
  assert.equal(uninstall(env).ok, true);
  for (const action of registrations(env.actions())) assert.equal(fs.readFileSync(action.destination, 'utf8'), '{"user":2e3}\n');
});

test('Shared matcher groups remove only kit commands at the first, middle or last position', (t) => {
  const env = environment(t);
  const action = registrations(env.actions({ clis: ['claude'] }))[0];
  const user = '{ "type" : "command", "command" : "user command", "number":1e2 }';
  const kitHook = JSON.stringify(action.entries[0].hooks[0]);
  for (const members of [[kitHook, user, user], [user, kitHook, user], [user, user, kitHook], [kitHook]]) {
    const current = Buffer.from('{"hooks":{"PreToolUse":[{"matcher":"Bash|PowerShell","hooks":[' + members.join(',') + ']}]}}');
    const removed = mergeJson(current, action, { remove: true }).content.toString();
    const count = members.filter((m) => m === user).length;
    assert.equal((removed.match(/user command/g) ?? []).length, count);
    if (count) assert.ok(removed.includes(user));
    assert.doesNotMatch(removed, /secret-scan/);
    JSON.parse(removed);
  }
});

test('Named collisions never overwrite hooks without a kit script path', (t) => {
  const env = environment(t);
  const action = registrations(env.actions({ clis: ['agy'] }))[0];
  const original = '{"vibecoding-secret-scan":{"enabled":true,"PreToolUse":[{"hooks":[{"command":"user script"}]}]}}';
  env.write(action.destination, original);
  assert.equal(execute([action], { home: env.home, force: true }).conflicts.length, 1);
  assert.equal(fs.readFileSync(action.destination, 'utf8'), original);
});

test('Pending JSON writes recover after atomic rename or state confirmation failures', (t) => {
  const env = environment(t);
  const action = registrations(env.actions({ clis: ['codex'] }))[0];
  env.write(action.destination, '{"user":true}\n');
  const rename = fs.renameSync;
  t.after(() => { fs.renameSync = rename; });
  fs.renameSync = (source, destination) => {
    if (destination === action.destination) throw new Error('Simulated rename failure');
    return rename(source, destination);
  };
  assert.equal(execute([action], env).ok, false);
  assert.equal(readState(env).items[0].pending, true);
  assert.equal(fs.readFileSync(action.destination, 'utf8'), '{"user":true}\n');
  fs.renameSync = rename;
  assert.equal(execute([action], env).ok, true);
  let writes = 0;
  fs.renameSync = (source, destination) => {
    if (destination === statePath(env.home) && ++writes === 2) throw new Error('Simulated confirmation failure');
    return rename(source, destination);
  };
  const update = registrations(env.actions({ clis: ['codex'], maestri: true }))[0];
  assert.equal(execute([update], env).ok, false);
  assert.equal(readState(env).items[0].pending, true);
  fs.renameSync = rename;
  assert.equal(execute([update], env).ok, true);
  assert.equal(readState(env).items[0].pending, undefined);
  assert.equal(uninstall(env).ok, true);
  assert.equal(fs.readFileSync(action.destination, 'utf8'), '{"user":true}\n');
});

test('CLI installs hooks by default, previews without writes and reports Codex approval', async (t) => {
  const env = environment(t);
  const output = [];
  const options = { ...env, cwd: env.project, isTTY: false, out: (line) => output.push(line), err: (line) => output.push(line),
    detect: () => ({ node: { ok: true, version: '22.0.0' }, git: { ok: true }, gitleaks: { ok: true },
      clis: [{ id: 'codex', state: 'ok' }], project: { inRepository: false }, installed: { plugins: {} } }) };
  assert.equal(await main(['--dry-run', '--json'], options), 0);
  const preview = JSON.parse(output.at(-1));
  assert.equal(preview.choices.hooks, true);
  assert.ok(preview.summary.actions.some((a) => a.type === 'json-merge'));
  assert.equal(fs.existsSync(env.home), false);
  output.length = 0;
  assert.equal(await main(['--yes', '--json'], options), 0, output.join('\n'));
  assert.ok(JSON.parse(output.at(-1)).warnings.includes(CODEX_HOOK_APPROVAL));
  output.length = 0;
  assert.equal(await main(['--yes'], options), 0, output.join('\n'));
  assert.ok(output.some((line) => line.includes(CODEX_HOOK_APPROVAL)));
  const hookPlan = registrations(buildPlan(choices({ clis: ['codex'] }), {}, env));
  assert.equal(summarizePlan(hookPlan, env).actions[0].situation, 'same');
});
