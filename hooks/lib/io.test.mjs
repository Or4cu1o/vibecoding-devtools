import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMain, parseInput, respond, runHook, shellCommands, windowsInput } from './io.mjs';

export const shapes = [
  ['Claude Code', command => ({ tool_name: 'PowerShell', tool_input: { command }, cwd: '/project' })],
  ['Codex', command => ({ hook_event_name: 'PreToolUse', turn_id: 'test-turn',
    tool_name: 'Bash', tool_input: { command }, cwd: '/project' })],
  ['Antigravity', command => ({ toolCall: { name: 'run_command', args: { CommandLine: command, Cwd: '/project' } } })],
];

export function capture() {
  return { text: '', write(value) { this.text += value; } };
}

test('T-63: isMain safely handles absent and unreadable entry paths', () => {
  const original = process.argv[1];
  try {
    process.argv[1] = undefined;
    assert.equal(isMain(import.meta.url), false);
    const missing = path.join(os.tmpdir(), 'vbd-missing-entry', 'hook.mjs');
    process.argv[1] = missing;
    assert.equal(isMain(pathToFileURL(missing).href), true);
    assert.equal(isMain(import.meta.url), false);
  } finally {
    process.argv[1] = original;
  }
});

test('Claude Bash keeps exit 2 and stderr; only the Codex turn_id selects JSON denial (T-62)', () => {
  const input = parseInput(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'x' } }));
  const stdout = capture();
  const stderr = capture();
  assert.equal(respond(input, 'Reason.', { stdout, stderr }), 2);
  assert.equal(stdout.text, '');
  assert.equal(stderr.text, 'Reason.\n');
});

// Captured in HkAgy on 1.5.2; personal metadata paths and the session ID are redacted.
const agy152 = JSON.parse(fs.readFileSync(new URL('../fixtures/antigravity-1.5.2-pre-tool-use.json',
  import.meta.url), 'utf8'));

test('Captured Antigravity 1.5.2 payload uses its sole workspace when Cwd is omitted', () => {
  assert.equal(Object.hasOwn(agy152.toolCall.args, 'Cwd'), false);
  const input = parseInput(JSON.stringify(agy152));
  assert.equal(input.cli, 'antigravity');
  assert.equal(input.command, 'git status --short');
  assert.equal(input.cwd, 'C:/teste/hooktest');
});

test('Antigravity explicit Cwd wins and ambiguous or malformed defaults stay unknown', () => {
  const explicit = structuredClone(agy152);
  explicit.toolCall.args.Cwd = 'C:/other/repo';
  assert.equal(parseInput(JSON.stringify(explicit)).cwd, 'C:/other/repo');
  for (const workspacePaths of [undefined, [], ['C:/one', 'C:/two'], ['relative'], [null], 'C:/one']) {
    assert.equal(parseInput(JSON.stringify({ ...agy152, workspacePaths })).cwd, undefined);
  }
  for (const workspace of ['/posix/repo', String.raw`\\server\share\repo`]) {
    assert.equal(parseInput(JSON.stringify({ ...agy152, workspacePaths: [workspace] })).cwd, workspace);
  }
});

test('Unknown Antigravity tools and malformed command arguments explicitly allow without checking', async () => {
  for (const toolCall of [{ name: 'view_file', args: { path: 'example' } },
    { name: 'run_command' }, { name: 'run_command', args: null },
    { name: 'run_command', args: { CommandLine: 42 } }]) {
    const stdout = capture();
    const stderr = capture();
    assert.equal(await runHook(() => assert.fail('Uncertain input must not be checked'), {
      stdin: Readable.from([JSON.stringify({ ...agy152, toolCall })]), stdout, stderr,
    }), 0);
    assert.equal(stdout.text, '{"decision":"allow"}\n');
    assert.equal(stderr.text, '');
  }
});

test('All executable hooks explicitly allow the captured 1.5.2 git status invocation', () => {
  for (const name of ['secret-scan', 'maestri-protocol', 'full-suite']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(`../${name}.mjs`, import.meta.url))], {
      input: JSON.stringify(agy152), encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '{"decision":"allow"}\n');
    assert.equal(result.stderr, '');
  }
});

test('T-63: symlinked hook enforces protocol denial', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-hook-symlink-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const hook = fileURLToPath(new URL('../maestri-protocol.mjs', import.meta.url));
  const link = path.join(root, 'maestri-protocol.mjs');
  try {
    fs.symlinkSync(path.relative(root, hook), link, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('File symlink creation is not permitted on this Windows host');
      return;
    }
    throw error;
  }
  const result = spawnSync(process.execPath, [link], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'maestri ask Agent invalid' } }),
    encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /valid protocol header/);
});

test('Captured 1.5.2 payload returns the protocol deny reason', () => {
  const input = structuredClone(agy152);
  input.toolCall.args.CommandLine = 'maestri ask Ninguem teste-sem-rodape';
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../maestri-protocol.mjs', import.meta.url))], {
    input: JSON.stringify(input), encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'deny');
  assert.match(JSON.parse(result.stdout).reason, /protocol header/);
  assert.equal(result.stderr, '');
});

test('Captured 1.5.2 payload without Cwd reaches the full-suite policy in its workspace', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-agy152-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  const input = structuredClone(agy152);
  input.workspacePaths = [root.replace(/\\/g, '/')];
  input.toolCall.args.CommandLine = 'npm test';
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../full-suite.mjs', import.meta.url))], {
    input: JSON.stringify(input), encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'deny');
  assert.match(JSON.parse(result.stdout).reason, /CI runs the full suite/);
  assert.equal(result.stderr, '');
});

for (const [name, shape] of shapes) {
  test(`${name}: extracts the command and tool cwd`, () => {
    const input = parseInput(JSON.stringify(shape('git commit')));
    assert.equal(input.command, 'git commit');
    assert.equal(input.cwd, '/project');
  });
  for (const deny of [false, true]) {
    test(`${name}: ${deny ? 'deny' : 'allow'} response`, () => {
      const stdout = capture();
      const stderr = capture();
      const input = parseInput(JSON.stringify(shape('command')));
      const exit = respond(input, deny ? 'Reason.' : undefined, { stdout, stderr });
      assert.equal(exit, name === 'Claude Code' && deny ? 2 : 0);
      assert.equal(stdout.text, name === 'Antigravity'
        ? `${JSON.stringify(deny ? { decision: 'deny', reason: 'Reason.' } : { decision: 'allow' })}\n`
        : name === 'Codex' && deny ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse',
          permissionDecision: 'deny', permissionDecisionReason: 'Reason.' } }) + '\n' : '');
      assert.equal(stderr.text, name === 'Claude Code' && deny ? 'Reason.\n' : '');
    });
  }
}

for (const text of ['{', 'null', '[]', '{}', '{"tool_name":"Read","tool_input":{"command":"x"}}']) {
  test(`uncertain input allows: ${text}`, async () => {
    const stdout = capture();
    const stderr = capture();
    const exit = await runHook(() => assert.fail('must not check unknown input'), {
      stdin: Readable.from([text]), stdout, stderr,
    });
    assert.equal(exit, 0);
    assert.equal(stdout.text + stderr.text, '');
  });
}

test('Antigravity never substitutes the process cwd', () => {
  assert.equal(parseInput('{"toolCall":{"name":"run_command","args":{"CommandLine":"git commit"}}}').cwd, undefined);
});

test('checker and stream failures allow', async () => {
  const stdout = capture();
  assert.equal(await runHook(() => { throw Error('private data'); }, {
    stdin: Readable.from([JSON.stringify(shapes[2][1]('x'))]), stdout, stderr: capture(),
  }), 0);
  assert.equal(stdout.text, '{"decision":"allow"}\n');
  assert.equal(await runHook(() => {}, {
    stdin: { async *[Symbol.asyncIterator]() { throw Error('read failed'); } },
    stdout: capture(), stderr: capture(),
  }), 0);
});

test('literal shell parsing preserves quoted arguments and command boundaries', () => {
  assert.deepEqual(shellCommands('git -C "a b" commit && maestri ask \'Agent\' \'hello\''), [
    ['git', '-C', 'a b', 'commit'], ['maestri', 'ask', 'Agent', 'hello'],
  ]);
});

for (const command of ['maestri ask A "$msg"', 'maestri ask A `command`', "maestri ask A @'\nx\n'@", 'git <<EOF', 'git "commit', 'git %ARGS%']) {
  test(`uncertain shell syntax: ${command}`, () => assert.equal(shellCommands(command), null));
}

for (const script of ['../secret-scan.mjs', '../maestri-protocol.mjs', '../full-suite.mjs']) {
  test(`${script}: executable entry point allows invalid JSON`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
      input: '{', encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout + result.stderr, '');
  });
  test(`${script}: executable entry point allows unrelated Antigravity tool command`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
      input: JSON.stringify(shapes[2][1]('echo safe')), encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{"decision":"allow"}\n');
    assert.equal(result.stderr, '');
  });
}

test('Windows tokenizer preserves every UNC backslash inside and outside quotes', () => {
  const path = '\\\\server\\share\\folder';
  for (const literal of [path, `"${path}"`, `'${path}'`]) {
    assert.deepEqual(shellCommands(`git -C ${literal} commit`, { windows: true }), [['git', '-C', path, 'commit']]);
  }
  assert.deepEqual(shellCommands('git -C "C:\\repo\\" commit', { windows: true }), [['git', '-C', 'C:\\repo\\', 'commit']]);
});

test('POSIX tokenizer still handles shell backslash escapes', () => {
  assert.deepEqual(shellCommands('git -C other\\ folder commit', { windows: false }), [['git', '-C', 'other folder', 'commit']]);
  assert.deepEqual(shellCommands('git -C "a\\\\b" commit', { windows: false }), [['git', '-C', 'a\\b', 'commit']]);
});

test('unsupported blocks and control flow fail open without inspecting their bodies', () => {
  for (const command of [
    'function Invoke-Tests {\npytest\n}\necho done',
    'if false; then\npytest\nfi', 'try { pytest } catch { echo done }',
    'for item in things; do pytest; done',
  ]) assert.equal(shellCommands(command), null, command);
  assert.deepEqual(shellCommands('echo "{literal}"'), [['echo', '{literal}']]);
});

test('T-54: literal Claude JSON preserves backslashes without treating them as shell escapes', () => {
  const payload = String.raw`{"tool_name":"Bash","tool_input":{"command":"npm test"},"cwd":"C:\\teste\\hooktest"}`;
  assert.equal(parseInput(payload).cwd, 'C:\\teste\\hooktest');
  // A transport that removes a JSON escape produces invalid input, not a path
  // variant. Never repair it by guessing or denying an uncertain tool call.
  assert.equal(parseInput(payload.replaceAll('\\\\', '\\')), null);
});

test('T-54: other hook executables preserve Claude backslash cwd', () => {
  for (const cwd of ['C:\\teste\\hooktest', 'C:/teste/hooktest']) {
    const protocol = spawnSync(process.execPath, [fileURLToPath(new URL('../maestri-protocol.mjs', import.meta.url))], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'maestri ask Agent invalid' }, cwd }),
      encoding: 'utf8', windowsHide: true,
    });
    assert.ifError(protocol.error);
    assert.equal(protocol.status, 2);
    assert.match(protocol.stderr, /valid protocol header/);
    // Replace child-process execution before importing the real entry point.
    // This exercises its stdin and cwd handling without invoking Git or gitleaks.
    const preload = `import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      childProcess.spawnSync = (command, args, options) => {
        if (options.cwd !== ${JSON.stringify(cwd)}) throw Error('Unexpected cwd');
        return { status: 99 };
      };
      syncBuiltinESMExports();`;
    const scan = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`,
      fileURLToPath(new URL('../secret-scan.mjs', import.meta.url))], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit' }, cwd }),
      encoding: 'utf8', windowsHide: true,
    });
    assert.ifError(scan.error);
    assert.equal(scan.status, 2);
    assert.match(scan.stderr, /contain secrets/);
  }
});

for (const input of [
  { shell: 'PowerShell' }, { shell: 'pwsh.exe' }, { shell: 'cmd.exe' },
  { cwd: 'C:\\repo' }, { cwd: '\\\\server\\share' },
  { command: 'git -C "\\\\server\\share" commit' },
]) {
  test('recognizes Windows shell or Windows input', () => assert.equal(windowsInput(input), true));
}
