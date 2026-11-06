import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInput, respond, runHook, shellCommands, windowsInput } from './io.mjs';

export const shapes = [
  ['Claude Code', command => ({ tool_name: 'PowerShell', tool_input: { command }, cwd: '/project' })],
  ['Codex', command => ({ tool_name: 'Bash', tool_input: { command }, cwd: '/project' })],
  ['Antigravity', command => ({ toolCall: { name: 'run_command', args: { CommandLine: command, Cwd: '/project' } } })],
];

export function capture() {
  return { text: '', write(value) { this.text += value; } };
}

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
      assert.equal(exit, name === 'Antigravity' ? 0 : deny ? 2 : 0);
      assert.equal(stdout.text, name === 'Antigravity'
        ? `${JSON.stringify(deny ? { decision: 'deny', reason: 'Reason.' } : {})}\n` : '');
      assert.equal(stderr.text, name !== 'Antigravity' && deny ? 'Reason.\n' : '');
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
  assert.equal(stdout.text, '{}\n');
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

for (const script of ['../secret-scan.mjs', '../maestri-protocol.mjs']) {
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
    assert.equal(result.stdout, '{}\n');
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

for (const input of [
  { shell: 'PowerShell' }, { shell: 'pwsh.exe' }, { shell: 'cmd.exe' },
  { cwd: 'C:\\repo' }, { cwd: '\\\\server\\share' },
  { command: 'git -C "\\\\server\\share" commit' },
]) {
  test('recognizes Windows shell or Windows input', () => assert.equal(windowsInput(input), true));
}
