import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPlan, reconcileUpdate } from './plan.mjs';
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
  const paths = { home: path.join(root, 'home with spaces'), project: path.join(root, 'home with spaces', 'project'), kit };
  const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
  const actions = (extra) => hookActions(choices(extra), paths);
  return { ...paths, write, actions };
}
const registrations = (actions) => actions.filter((a) => a.type === 'json-merge');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

test('Hook plans keep project runtimes and all CLI registrations inside the repository', (t) => {
  const env = environment(t);
  for (const scope of ['global', 'project']) {
    const actions = buildPlan(choices({ scope }), {}, env);
    const scripts = actions.filter((a) => a.description.startsWith('Kit hook script:'));
    assert.equal(scripts.length, 4);
    assert.equal(new Set(scripts.map((a) => a.destination)).size, scripts.length);
    const root = scope === 'project' ? env.project : env.home;
    const runtime = path.join(root, '.vibecoding-devtools', 'hooks');
    assert.ok(scripts.every((a) => a.destination.startsWith(runtime + path.sep)));
    const [agy, claude, codex] = registrations(actions);
    assert.equal(agy.destination, scope === 'project' ? path.join(env.project, '.agents', 'hooks.json')
      : path.join(env.home, '.gemini', 'config', 'hooks.json'));
    assert.match(claude.destination, /settings\.json$/);
    assert.equal(claude.destination, path.join(root, '.claude', 'settings.json'));
    assert.equal(codex.destination, path.join(root, '.codex', 'hooks.json'));
    assert.equal(claude.entries[0].matcher, 'Bash|PowerShell');
    assert.equal(codex.entries[0].matcher, 'Bash');
    const hook = codex.entries[0].hooks[0];
    assert.equal(hook.commandWindows, hook.command);
    assert.equal(hook.timeout, 30);
    if (scope === 'project') {
      assert.match(hook.command, /^node -e /);
      assert.match(hook.command, /git.*rev-parse.*--show-toplevel/);
      assert.equal(claude.entries[0].hooks[0].command,
        'node "${CLAUDE_PROJECT_DIR}/.vibecoding-devtools/hooks/secret-scan.mjs"');
    } else assert.match(hook.command, /^node ".*home with spaces.*secret-scan\.mjs"$/);
    assert.deepEqual(Object.keys(agy.entries), ['vibecoding-secret-scan', 'vibecoding-full-suite']);
    assert.equal(agy.entries['vibecoding-secret-scan'].enabled, true);
    assert.equal(agy.entries['vibecoding-secret-scan'].PreToolUse[0].matcher, 'run_command');
    assert.equal(agy.entries['vibecoding-full-suite'].enabled, true);
    assert.equal(agy.entries['vibecoding-full-suite'].PreToolUse[0].matcher, 'run_command');
    for (const action of [agy, claude, codex]) {
      assert.ok(action.scriptPaths.some((file) => file.endsWith('full-suite.mjs')));
      const group = action.cli === 'agy' ? action.entries['vibecoding-full-suite'].PreToolUse[0] : action.entries[1];
      assert.equal(group.matcher, action.entries[0]?.matcher ?? 'run_command');
      assert.equal(group.hooks[0].timeout, 30);
      if (action.cli === 'agy') assert.equal(group.hooks[0].command,
        `node ${scope === 'project' ? '../' : '../../'}.vibecoding-devtools/hooks/full-suite.mjs`);
      else if (scope === 'global') assert.match(group.hooks[0].command, /^node ".*home with spaces.*full-suite\.mjs"$/);
      if (scope === 'project') {
        assert.doesNotMatch(group.hooks[0].command, /home with spaces/);
        assert.doesNotMatch(group.hooks[0].command, /\\/);
      }
      if (action.cli === 'codex') assert.equal(group.hooks[0].commandWindows, group.hooks[0].command);
    }
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
    ['full-suite.mjs', 'maestri-protocol.mjs', 'secret-scan.mjs', 'lib/io.mjs']);
  assert.equal(execute(actions, env).ok, true);
  const installed = path.join(env.home, '.vibecoding-devtools', 'hooks');
  assert.deepEqual(fs.readdirSync(installed).sort(), ['full-suite.mjs', 'lib', 'maestri-protocol.mjs', 'secret-scan.mjs']);
  assert.deepEqual(fs.readdirSync(path.join(installed, 'lib')), ['io.mjs']);
  for (const action of actions) assert.deepEqual(fs.readFileSync(action.destination), fs.readFileSync(action.source));
});

for (const scope of ['global', 'project']) test(`Antigravity ${scope} commands run from hooks.json without quotes through the platform shell`, (t) => {
  const env = environment(t);
  const paths = { ...env, project: path.join(env.home, 'projects', 'nested', 'repo') };
  const actions = hookActions(choices({ clis: ['agy'], scope, maestri: true }), paths);
  const action = registrations(actions)[0];
  assert.equal(execute(actions, env).ok, true);
  for (const [name, entry] of Object.entries(json(action.destination))) {
    const command = entry.PreToolUse[0].hooks[0].command;
    const expected = scope === 'global' ? '../../.vibecoding-devtools/hooks/'
      : '../.vibecoding-devtools/hooks/';
    assert.equal(command, `node ${expected}${name.replace('vibecoding-', '')}.mjs`);
    assert.doesNotMatch(command, /["'\\]/);
    assert.equal(command.split(/\s+/).length, 2);
    const windows = process.platform === 'win32';
    const result = spawnSync(windows ? process.env.ComSpec ?? 'cmd.exe' : '/bin/sh',
      windows ? ['/d', '/s', '/c', command] : ['-c', command], {
        cwd: path.dirname(action.destination), input: '{}', encoding: 'utf8', windowsHide: true,
        env: { ...process.env, HOME: env.home, USERPROFILE: env.home },
      });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /Cannot find module/);
  }
  assert.ok(registrations(hookActions(choices({ clis: ['agy'], scope, maestri: true }), paths))
    .every((a) => jsonMergeSituation(fs.readFileSync(a.destination), a, readState(env).items.find((i) => i.destination === a.destination)) === 'same'));
  assert.equal(uninstall(env).ok, true);
  assert.equal(fs.existsSync(action.destination), false);
});

test('Project hook commands stay relative even with unrelated home paths, spaces and different drives', (t) => {
  const env = environment(t);
  const paths = { ...env, project: path.join(path.dirname(env.home), 'separate project') };
  assert.doesNotThrow(() => hookActions(choices({ clis: ['agy'] }), paths));
  const action = registrations(hookActions(choices({ clis: ['agy'], scope: 'project' }), paths))[0];
  assert.equal(action.entries['vibecoding-secret-scan'].PreToolUse[0].hooks[0].command,
    'node ../.vibecoding-devtools/hooks/secret-scan.mjs');
  assert.doesNotThrow(() => hookActions(choices({ clis: ['claude', 'codex'], scope: 'project' }), paths));
  assert.deepEqual(hookActions(choices({ clis: ['agy'], scope: 'project', hooks: false }), paths), []);
  assert.equal(fs.existsSync(env.home), false);
  assert.equal(fs.existsSync(paths.project), false);
  if (process.platform === 'win32') {
    const drive = path.parse(env.home).root.slice(0, 1).toUpperCase() === 'Z' ? 'Y' : 'Z';
    assert.doesNotThrow(() => hookActions(choices({ clis: ['agy'], scope: 'project' }),
      { ...env, project: `${drive}:\\project with spaces` }));
  }
  assert.throws(() => hookActions(choices({ scope: 'project' }), { home: env.home, kit }), /require paths.project/);
});

test('Antigravity refuses any unsafe relative path before returning registrations', (t) => {
  const env = environment(t);
  const relative = path.relative;
  try {
    path.relative = () => 'folder with spaces/script.mjs';
    assert.throws(() => env.actions({ clis: ['agy'] }), /Antigravity.*no spaces/);
    assert.throws(() => env.actions({ clis: ['agy'], scope: 'project' }), /Antigravity.*no spaces/);
  } finally { path.relative = relative; }
  assert.equal(fs.existsSync(env.home), false);
});

test('Project commands deny from CLI working folders and remain portable after cloning', (t) => {
  const env = environment(t);
  const selection = choices({ scope: 'project', maestri: true });
  const actions = hookActions(selection, env);
  assert.equal(execute(actions, env).ok, true);
  const clone = path.join(path.dirname(env.home), 'cloned repo with spaces');
  fs.cpSync(env.project, clone, { recursive: true });
  const windows = process.platform === 'win32';
  const bash = windows ? [
    path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ].find((file) => fs.existsSync(file)) : '/bin/sh';
  assert.ok(bash, 'Git Bash is required for Claude Code hook commands on Windows');
  for (const project of [env.project, clone]) {
    assert.equal(spawnSync('git', ['init', project], { encoding: 'utf8', windowsHide: true }).status, 0);
    const nested = path.join(project, 'packages', 'example');
    fs.mkdirSync(nested, { recursive: true });
    for (const action of registrations(hookActions(selection, { ...env, project }))) {
      const entries = json(action.destination);
      const hook = action.cli === 'agy' ? entries['vibecoding-maestri-protocol'].PreToolUse[0].hooks[0]
        : entries.hooks.PreToolUse.find((group) => group.hooks[0].command.includes('maestri-protocol.mjs')).hooks[0];
      assert.doesNotMatch(hook.command, new RegExp(env.home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const command = windows && action.cli === 'codex' ? hook.commandWindows : hook.command;
      const cwd = action.cli === 'agy' ? path.dirname(action.destination) : nested;
      const input = action.cli === 'agy'
        ? { toolCall: { name: 'run_command', args: { CommandLine: 'maestri ask Agent bad', Cwd: project } } }
        : { tool_name: 'Bash', tool_input: { command: 'maestri ask Agent bad' }, cwd: project,
          ...(action.cli === 'codex' ? { turn_id: 'test-turn' } : {}) };
      const shell = action.cli === 'claude' ? bash : windows
        ? action.cli === 'codex' ? 'powershell.exe' : process.env.ComSpec ?? 'cmd.exe' : '/bin/sh';
      const args = windows && action.cli === 'codex' ? ['-NoProfile', '-Command', command]
        : windows && action.cli === 'agy' ? ['/d', '/s', '/c', command] : ['-c', command];
      const result = spawnSync(shell, args, { cwd, input: JSON.stringify(input), encoding: 'utf8', windowsHide: true,
        windowsVerbatimArguments: windows && action.cli === 'agy',
        env: { ...process.env, HOME: env.home, USERPROFILE: env.home, CODEX_HOME: path.join(env.home, '.codex'),
          CLAUDE_PROJECT_DIR: project.replace(/\\/g, '/') } });
      assert.equal(result.error, undefined);
      if (action.cli !== 'claude') {
        assert.equal(result.status, 0, result.stderr);
        const response = JSON.parse(result.stdout);
        assert.equal(action.cli === 'agy' ? response.decision : response.hookSpecificOutput.permissionDecision, 'deny');
      } else assert.equal(result.status, 2, result.stderr);
      assert.match(action.cli !== 'claude' ? result.stdout : result.stderr, /protocol header/);
    }
  }
  assert.equal(fs.existsSync(path.join(env.home, '.vibecoding-devtools', 'hooks')), false);
  for (const action of registrations(actions)) {
    const installed = json(action.destination);
    installed.userSetting = true;
    env.write(action.destination, JSON.stringify(installed, null, 2));
  }
  assert.equal(execute(hookActions(choices({ scope: 'project' }), env), env).ok, true);
  assert.equal(uninstall(env).ok, true);
  for (const action of registrations(actions)) assert.equal(json(action.destination).userSetting, true);
  assert.ok(actions.filter((a) => a.type === 'copy').every((a) => !fs.existsSync(a.destination)));
});

for (const scope of ['global', 'project']) {
  test(`Codex ${scope} registered Windows commands deny through PowerShell with exit 0 (T-62)`,
    { skip: process.platform !== 'win32' }, (t) => {
      const env = environment(t);
      const actions = hookActions(choices({ clis: ['codex'], scope, maestri: true }), env);
      assert.equal(execute(actions, env).ok, true);
      assert.equal(spawnSync('git', ['init', env.project], { windowsHide: true }).status, 0);
      env.write(path.join(env.project, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
      env.write(path.join(env.project, 'package.json'), '{"scripts":{"test":"node --test"}}');
      const nested = path.join(env.project, 'packages', 'example');
      fs.mkdirSync(nested, { recursive: true });
      const registration = json(registrations(actions)[0].destination);
      // Control the scanner result without requiring a machine-wide gitleaks install.
      const preload = path.join(env.project, 'scanner-result.mjs');
      env.write(preload, `import childProcess from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        const original = childProcess.spawnSync;
        childProcess.spawnSync = (command, ...args) => command === 'gitleaks'
          ? { status: 99, stdout: 'PRIVATE_SCANNER_OUTPUT' } : original(command, ...args);
        syncBuiltinESMExports();`);
      for (const name of ['maestri-protocol', 'full-suite', 'secret-scan']) {
        const hook = registration.hooks.PreToolUse.find((group) => group.hooks[0].command.includes(`${name}.mjs`)).hooks[0];
        assert.equal(hook.commandWindows, hook.command);
        const commands = ['git status', name === 'secret-scan' ? 'git commit -m test'
          : name === 'maestri-protocol' ? 'maestri ask Ninguem teste-sem-rodape' : 'npm test'];
        for (const [index, command] of commands.entries()) {
          const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', hook.commandWindows], {
            cwd: nested, input: JSON.stringify({ session_id: 'test-session', turn_id: 'test-turn',
              hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: env.project }),
            encoding: 'utf8', windowsHide: true,
            env: { ...process.env, ...(name === 'secret-scan'
              ? { NODE_OPTIONS: `--import="${pathToFileURL(preload).href}"` } : {}) },
          });
          assert.equal(result.error, undefined);
          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.stderr, '');
          if (index === 0) assert.equal(result.stdout, '');
          else {
            const output = JSON.parse(result.stdout).hookSpecificOutput;
            assert.equal(output.hookEventName, 'PreToolUse');
            assert.equal(output.permissionDecision, 'deny');
            assert.match(output.permissionDecisionReason, name === 'secret-scan' ? /contain secrets/
              : name === 'maestri-protocol' ? /protocol header/ : /CI runs the full suite/);
            assert.doesNotMatch(result.stdout, /teste-sem-rodape|PRIVATE_SCANNER_OUTPUT/);
          }
        }
      }
    });
}

for (const legacyScope of ['home', 'T-51']) {
  test(`Update migrates ${legacyScope} project hooks into the repository and preserves user JSON`, async (t) => {
    const env = environment(t);
    const selection = choices({ scope: 'project', maestri: true });
    const legacy = hookActions({ ...selection, scope: 'global' }, env);
    if (legacyScope === 'T-51') {
      const agy = registrations(legacy).find((a) => a.cli === 'agy');
      agy.destination = path.join(env.project, '.agents', 'hooks.json');
    }
    const originals = new Map();
    for (const action of [...registrations(legacy), ...registrations(hookActions(selection, env))]) {
      const original = action.cli === 'agy' ? '{"user-hook":{"enabled":true}}\n' : '{"user":true}\n';
      env.write(action.destination, original);
      originals.set(action.destination, original);
    }
    const output = [];
    const options = { ...env, cwd: env.project, isTTY: false, out: (line) => output.push(line),
      detect: () => ({ node: { ok: true }, git: { ok: true }, gitleaks: { ok: true },
        clis: selection.clis.map((id) => ({ id, state: 'ok' })),
        project: { inRepository: true, root: env.project, stacks: [] } }),
      planBuilder: (selected, detection, paths) => hookActions(selected, paths) };
    assert.equal(await main(['install', '--project', '--maestri', '--yes', '--json'], {
      ...options, planBuilder: () => legacy,
    }), 0);
    const before = fs.readFileSync(statePath(env.home));
    output.length = 0;
    assert.equal(await main(['update', '--dry-run', '--json'], options), 0);
    const preview = JSON.parse(output.at(-1));
    assert.ok(preview.summary.actions.some((a) => a.operation === 'remove' && a.type === 'copy'));
    assert.deepEqual(fs.readFileSync(statePath(env.home)), before);
    assert.equal(fs.existsSync(path.join(env.project, '.vibecoding-devtools', 'hooks')), false);
    assert.equal(await main(['update', '--yes', '--json'], options), 0, output.at(-1));
    assert.ok(readState(env).items.every((item) => item.destination.startsWith(env.project + path.sep)));
    for (const action of legacy.filter((a) => a.type === 'copy')) {
      assert.equal(fs.existsSync(action.destination), false);
    }
    for (const action of registrations(legacy).filter((a) => !a.destination.startsWith(env.project + path.sep))) {
      assert.equal(fs.readFileSync(action.destination, 'utf8'), originals.get(action.destination));
    }
    output.length = 0;
    assert.equal(await main(['update', '--yes', '--json'], options), 0);
    assert.deepEqual(JSON.parse(output.at(-1)).actions, []);
    // A removed hook script leaves both the repository and state on the next update.
    const dropped = path.join(env.project, '.vibecoding-devtools', 'hooks', 'maestri-protocol.mjs');
    assert.equal(await main(['update', '--no-maestri', '--yes', '--json'], {
      ...options, planBuilder: (selected, detection, paths) => hookActions(selected, paths)
        .filter((a) => a.source !== path.join(kit, 'hooks', 'maestri-protocol.mjs')),
    }), 0);
    assert.equal(fs.existsSync(dropped), false, output.at(-1));
    assert.equal(await main(['uninstall', '--yes', '--json'], options), 0);
    assert.deepEqual(readState(env).items, []);
    for (const [destination, original] of originals) assert.equal(fs.readFileSync(destination, 'utf8'), original);
  });
}

for (const legacyScope of ['home', 'T-51']) {
  test(`Modified ${legacyScope} registration keeps its runtime and helpers through migration and uninstall (T-60)`, async (t) => {
    const env = environment(t);
    const selection = choices({ scope: 'project', maestri: true, root: env.project });
    const legacy = hookActions({ ...selection, scope: 'global' }, env);
    const agy = registrations(legacy).find((action) => action.cli === 'agy');
    if (legacyScope === 'T-51') agy.destination = path.join(env.project, '.agents', 'hooks.json');
    assert.equal(execute(legacy, { ...env, choices: selection }).ok, true);
    const original = fs.readFileSync(agy.destination, 'utf8');
    const modified = original.replace(/"timeout": 30/g, '"timeout": 99');
    env.write(agy.destination, modified);
    const output = [];
    const options = { ...env, cwd: env.project, isTTY: false, out: (line) => output.push(line),
      detect: () => ({ node: { ok: true }, git: { ok: true }, gitleaks: { ok: true },
        clis: selection.clis.map((id) => ({ id, state: 'ok' })),
        project: { inRepository: true, root: env.project, stacks: [] } }),
      planBuilder: (selected, detection, paths) => hookActions(selected, paths) };
    const scripts = legacy.filter((action) => action.type === 'copy');
    const retained = () => {
      assert.equal(fs.readFileSync(agy.destination, 'utf8'), modified);
      for (const script of scripts) {
        assert.deepEqual(fs.readFileSync(script.destination), fs.readFileSync(script.source));
        assert.ok(readState(env).items.some((item) => item.destination === script.destination));
      }
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(await main(['update', '--yes', '--json'], options), legacyScope === 'home' ? 0 : 1, output.at(-1));
      retained();
    }
    assert.equal(await main(['uninstall', '--yes', '--json'], options), 0);
    retained();
    assert.ok(JSON.parse(output.at(-1)).warnings.some((warning) => /still references runtime/.test(warning.reason)));
    // Once the last retained registration can be removed, cleanup is safe again.
    env.write(agy.destination, original);
    assert.equal(await main(['uninstall', '--yes', '--json'], options), 0);
    for (const script of scripts) assert.equal(fs.existsSync(script.destination), false);
    assert.deepEqual(readState(env).items, []);
  });
}

test('Project JSON merges preserve conflicts and edited project files on update and uninstall', (t) => {
  const env = environment(t);
  const selection = choices({ scope: 'project', maestri: true });
  const actions = hookActions(selection, env);
  for (const action of registrations(actions)) env.write(action.destination, '{"user":true}\n');
  assert.equal(execute(actions, env).ok, true);
  for (const action of registrations(actions)) {
    const modified = fs.readFileSync(action.destination, 'utf8').replace(/"timeout": 30/g, '"timeout": 99');
    env.write(action.destination, modified);
  }
  const update = execute(hookActions(selection, env), env);
  assert.equal(update.conflicts.length, 3);
  assert.equal(update.ok, false);
  const script = actions.find((action) => action.source?.endsWith('full-suite.mjs'));
  env.write(script.destination, 'locally edited runtime\n');
  const result = uninstall(env);
  assert.equal(result.warnings.filter((warning) => /Modified JSON entries/.test(warning.reason)).length, 3);
  assert.equal(result.warnings.filter((warning) => /Modified file/.test(warning.reason)).length, 1);
  for (const action of registrations(actions)) {
    assert.equal(json(action.destination).user, true);
    assert.match(fs.readFileSync(action.destination, 'utf8'), /"timeout": 99/);
  }
  assert.equal(fs.readFileSync(script.destination, 'utf8'), 'locally edited runtime\n');
  assert.equal(readState(env).items.length, 7);
});

test('Unreadable hook JSON keeps tracked scripts and helpers on update and uninstall (T-60)', (t) => {
  const env = environment(t);
  const actions = env.actions({ clis: ['agy'], maestri: true });
  assert.equal(execute(actions, env).ok, true);
  const registration = registrations(actions)[0];
  env.write(registration.destination, '{invalid JSON');
  const before = fs.readFileSync(statePath(env.home));
  const removal = reconcileUpdate([], env);
  assert.equal(execute(removal, { ...env, dryRun: true }).ok, true);
  assert.deepEqual(fs.readFileSync(statePath(env.home)), before);
  for (const result of [execute(removal, env), uninstall(env)]) {
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((warning) => /still references runtime/.test(warning.reason)));
  }
  for (const script of actions.filter((action) => action.type === 'copy')) {
    assert.deepEqual(fs.readFileSync(script.destination), fs.readFileSync(script.source));
  }
  assert.equal(readState(env).items.length, actions.length);
});

test('Update migrates tracked absolute Antigravity commands and uninstall removes relative entries', async (t) => {
  const env = environment(t);
  const actions = env.actions({ clis: ['agy'], maestri: true });
  const registration = registrations(actions)[0];
  const legacy = structuredClone(registration);
  for (const [name, entry] of Object.entries(legacy.entries)) {
    const script = path.join(env.home, '.vibecoding-devtools', 'hooks', `${name.replace('vibecoding-', '')}.mjs`).replace(/\\/g, '/');
    entry.PreToolUse[0].hooks[0].command = `node "${script}"`;
  }
  const original = '{"user-hook":{"enabled":true}}\n';
  env.write(registration.destination, original);
  const output = [];
  const options = { ...env, isTTY: false, out: (line) => output.push(line),
    detect: () => ({ node: { ok: true }, git: { ok: true }, gitleaks: { ok: true },
      clis: [{ id: 'agy', state: 'ok' }], project: { inRepository: false } }),
    planBuilder: (selection, detection, paths) => hookActions(selection, paths) };
  assert.equal(await main(['install', '--maestri', '--yes', '--json'], { ...options,
    planBuilder: () => actions.map((action) => action === registration ? legacy : action) }), 0);
  const before = fs.readFileSync(registration.destination);
  const stateBefore = fs.readFileSync(statePath(env.home));
  output.length = 0;
  assert.equal(await main(['update', '--dry-run', '--json'], options), 0);
  assert.equal(registrations(JSON.parse(output.at(-1)).summary.actions)[0].situation, 'update');
  assert.deepEqual(fs.readFileSync(registration.destination), before);
  assert.deepEqual(fs.readFileSync(statePath(env.home)), stateBefore);
  assert.equal(await main(['update', '--yes', '--json'], options), 0);
  const installed = json(registration.destination);
  for (const [name, entry] of Object.entries(registration.entries)) assert.deepEqual(installed[name], entry);
  assert.deepEqual(installed['user-hook'], { enabled: true });
  assert.equal(await main(['uninstall', '--yes', '--json'], options), 0);
  assert.equal(fs.readFileSync(registration.destination, 'utf8'), original);
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
    assert.equal(jsonMergeSnapshot(fs.readFileSync(action.destination), action).count, 2);
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

test('Update adds full-suite to legacy installs, keeps it on repeat and uninstall preserves user hooks', async (t) => {
  const env = environment(t);
  const output = [];
  const originals = new Map(registrations(env.actions()).map((action) => [action.destination,
    action.cli === 'agy' ? '{"user-hook":{"enabled":true}}\n'
      : '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"user hook"}]}]}}\n']));
  for (const [destination, content] of originals) env.write(destination, content);
  const options = { ...env, cwd: env.project, isTTY: false, out: (line) => output.push(line), err: (line) => output.push(line),
    detect: () => ({ node: { ok: true, version: '22.0.0' }, git: { ok: true }, gitleaks: { ok: true },
      clis: ['claude', 'codex', 'agy'].map((id) => ({ id, state: 'ok' })), project: { inRepository: false } }),
    planBuilder: (selection, detection, paths) => hookActions(selection, paths) };
  const legacyBuilder = (selection, detection, paths) => hookActions(selection, paths)
    .filter((action) => !action.source?.endsWith('full-suite.mjs'))
    .map((action) => action.type !== 'json-merge' ? action : {
      ...action, scriptPaths: action.scriptPaths.filter((file) => !file.endsWith('full-suite.mjs')),
      entries: action.cli === 'agy'
        ? Object.fromEntries(Object.entries(action.entries).filter(([name]) => name !== 'vibecoding-full-suite'))
        : action.entries.filter((group) => !group.hooks[0].command.includes('full-suite.mjs')),
    });
  assert.equal(await main(['install', '--yes', '--json'], { ...options, planBuilder: legacyBuilder }), 0);
  const runtime = path.join(env.home, '.vibecoding-devtools', 'hooks', 'full-suite.mjs');
  assert.equal(fs.existsSync(runtime), false);
  const before = fs.readFileSync(statePath(env.home));
  output.length = 0;
  assert.equal(await main(['update', '--dry-run', '--json'], options), 0);
  const preview = JSON.parse(output.at(-1));
  assert.equal(preview.choices.hooks, true);
  assert.ok(preview.summary.actions.some((action) => action.destination === runtime && action.situation === 'new'));
  assert.ok(registrations(preview.summary.actions).every((action) => action.situation === 'update'));
  assert.deepEqual(fs.readFileSync(statePath(env.home)), before);
  assert.equal(fs.existsSync(runtime), false);
  output.length = 0;
  assert.equal(await main(['update', '--yes', '--json'], options), 0, output.join('\n'));
  assert.deepEqual(fs.readFileSync(runtime), fs.readFileSync(path.join(kit, 'hooks', 'full-suite.mjs')));
  assert.ok(readState(env).items.some((item) => item.type === 'copy' && item.destination === runtime));
  for (const action of registrations(env.actions())) {
    assert.match(fs.readFileSync(action.destination, 'utf8'), /full-suite\.mjs/);
    assert.equal(jsonMergeSnapshot(fs.readFileSync(action.destination), action).count, 2);
    if (action.cli === 'agy') assert.equal(json(action.destination)['vibecoding-full-suite'].enabled, true);
  }
  output.length = 0;
  assert.equal(await main(['update', '--yes', '--json'], options), 0);
  assert.equal(JSON.parse(output.at(-1)).actions.length, 0);
  output.length = 0;
  assert.equal(await main(['uninstall', '--yes', '--json'], options), 0);
  assert.equal(fs.existsSync(runtime), false);
  for (const [destination, content] of originals) assert.equal(fs.readFileSync(destination, 'utf8'), content);
  assert.deepEqual(readState(env).items, []);
});

test('CLI --no-hooks saves the disabled choice and update leaves hooks absent', async (t) => {
  const env = environment(t);
  const output = [];
  const options = { ...env, cwd: env.project, isTTY: false, out: (line) => output.push(line), err: (line) => output.push(line),
    detect: () => ({ node: { ok: true, version: '22.0.0' }, git: { ok: true }, gitleaks: { ok: true },
      clis: ['claude', 'codex', 'agy'].map((id) => ({ id, state: 'ok' })), project: { inRepository: false } }),
    planBuilder: (selection, detection, paths) => hookActions(selection, paths) };
  assert.equal(await main(['install', '--no-hooks', '--yes', '--json'], options), 0);
  assert.equal(readState(env).choices.hooks, false);
  assert.equal(fs.existsSync(path.join(env.home, '.vibecoding-devtools', 'hooks')), false);
  output.length = 0;
  assert.equal(await main(['update', '--yes', '--json'], options), 0);
  assert.equal(JSON.parse(output.at(-1)).actions.length, 0);
  assert.ok(registrations(env.actions()).every((action) => !fs.existsSync(action.destination)));
  output.length = 0;
  assert.equal(await main(['update', '--hooks', '--yes', '--json'], options), 0);
  for (const action of registrations(env.actions())) assert.match(fs.readFileSync(action.destination, 'utf8'), /full-suite\.mjs/);
});
