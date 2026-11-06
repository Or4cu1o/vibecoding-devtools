import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { checkSecretScan, GITLEAKS_ARGS } from './secret-scan.mjs';
import { parseInput, runHook } from './lib/io.mjs';

const shapes = [
  command => ({ turn_id: 'test-turn', tool_name: 'Bash', tool_input: { command }, cwd: '/project' }),
  command => ({ tool_name: 'PowerShell', tool_input: { command }, cwd: '/project' }),
  command => ({ toolCall: { name: 'run_command', args: { CommandLine: command, Cwd: '/project' } } }),
];
const capture = () => ({ text: '', write(value) { this.text += value; } });
const warning = 'Secret scan unavailable; allowing command.\n';
const flags = ['--redact', '--no-banner', '--exit-code', '99'];
const unstaged = ['git', '--pre-commit', ...flags];
const listing = ['ls-files', '--others', '--exclude-standard', '-z'];
const ok = { status: 0, stdout: '' };

function scanner(input, respond = () => ok) {
  const calls = [];
  const stderr = capture();
  const reason = checkSecretScan(input, {
    stderr, runner(command, args, options) {
      calls.push({ command, args, options });
      return respond(command, args, options);
    },
  });
  return { calls, reason, stderr: stderr.text };
}

for (const [index, shape] of shapes.entries()) {
  for (const status of [0, 1, 2, 99]) {
    test(`CLI shape ${index}: gitleaks exit ${status}`, async () => {
      const stdout = capture();
      const stderr = capture();
      const calls = [];
      const exit = await runHook((input, options) => checkSecretScan(input, {
        ...options, runner(command, args, options) {
          calls.push({ command, args, options });
          return command === 'git' ? ok : { status, stdout: 'SECRET_VALUE', stderr: 'SECRET_VALUE' };
        },
      }), { stdin: Readable.from([JSON.stringify(shape('git commit -m safe'))]), stdout, stderr });
      assert.equal(calls.length, status === 99 ? 1 : 3);
      assert.equal(calls[0].command, 'gitleaks');
      assert.deepEqual(calls[0].args, ['git', '--pre-commit', '--staged', ...flags]);
      assert.equal(calls[0].options.cwd, '/project');
      assert.equal(exit, index === 1 && status === 99 ? 2 : 0);
      if (index === 0 && status === 99) assert.equal(JSON.parse(stdout.text).hookSpecificOutput.permissionDecision, 'deny');
      if (index === 2) assert.equal(JSON.parse(stdout.text).decision, status === 99 ? 'deny' : 'allow');
      assert.equal((stdout.text + stderr.text).includes('SECRET_VALUE'), false);
      if (status === 1 || status === 2) assert.equal(stderr.text, warning);
    });
  }
}

for (const command of ['git commit', 'git commit --amend', 'git -c user.name=Test commit', 'git -cuser.name=Test commit', 'git --no-pager commit', 'git status; git commit', '& "C:\\Git\\git.exe" commit', 'git add . && git commit -m safe', 'git commit -a', 'git add new.txt && git commit -am safe']) {
  test(`scans staged, unstaged and untracked candidates: ${command}`, () => {
    const result = scanner({ command, cwd: '/project' }, (command) => command === 'git'
      ? { status: 0, stdout: 'new file.txt\0nested/another.txt\0' } : ok);
    assert.equal(result.reason, undefined);
    assert.equal(result.stderr, '');
    assert.deepEqual(result.calls.map(call => [call.command, call.args]), [
      ['gitleaks', GITLEAKS_ARGS], ['gitleaks', unstaged], ['git', listing],
      ['gitleaks', ['dir', resolve('/project', 'new file.txt'), ...flags]],
      ['gitleaks', ['dir', resolve('/project', 'nested/another.txt'), ...flags]],
    ]);
  });
}

test('skips dir scans when no untracked non-ignored files exist', () => {
  const result = scanner({ command: 'git commit', cwd: '/project' });
  assert.equal(result.calls.length, 3);
  assert.deepEqual(result.calls[2].args, listing);
});

for (const phase of ['staged', 'unstaged', 'untracked']) {
  test(`denies leaks in ${phase} even before a chained add or commit -a`, () => {
    const result = scanner({ command: 'git add . && git commit -a', cwd: '/project' }, (command, args) => {
      if (command === 'git') return { status: 0, stdout: 'new.txt\0' };
      const current = args[0] === 'dir' ? 'untracked' : args.includes('--staged') ? 'staged' : 'unstaged';
      return { status: current === phase ? 99 : 0, stdout: 'SECRET_VALUE', stderr: 'SECRET_VALUE' };
    });
    assert.match(result.reason, /contain secrets/);
    assert.equal((result.reason + result.stderr).includes('SECRET_VALUE'), false);
  });
}

test('a scanner failure does not hide a later leak', () => {
  const result = scanner({ command: 'git commit', cwd: '/project' }, (_, args) => ({ status: args.includes('--staged') ? 1 : 99 }));
  assert.match(result.reason, /contain secrets/);
});

test('git -C uses the effective repository directory for every subprocess', () => {
  const result = scanner({ command: 'git -C "other repo" -C nested commit', cwd: '/project' });
  assert.equal(result.calls.length, 3);
  for (const call of result.calls) assert.equal(call.options.cwd, resolve('/project', 'other repo', 'nested'));
});

for (const command of ['echo git commit', 'git status', 'git commit-tree', 'git -C "$repo" commit', 'git commit <<EOF', 'cd other && git commit', 'git --git-dir other commit', 'git --work-tree=other commit', 'export GIT_DIR=other; git commit']) {
  test(`does not scan unrelated or uncertain command: ${command}`, () => {
    const result = scanner({ command, cwd: '/project' });
    assert.equal(result.reason, undefined);
    assert.equal(result.calls.length, 0);
  });
}

for (const [name, shape] of [['PowerShell', shapes[1]], ['Antigravity', shapes[2]], ['Bash on Windows', shapes[0]]]) {
  for (const quoted of [false, true]) {
    test(`${name}: preserves ${quoted ? 'quoted' : 'unquoted'} UNC git -C paths`, () => {
      const path = '\\\\server\\share\\repo';
      const input = shape(`git -C ${quoted ? `"${path}"` : path} commit`);
      if (input.cwd) input.cwd = 'C:\\project';
      else input.toolCall.args.Cwd = 'C:\\project';
      const result = scanner(parseInput(JSON.stringify(input)), command => command === 'git'
        ? { status: 0, stdout: 'new.txt\0' } : ok);
      assert.equal(result.calls.length, 4);
      for (const call of result.calls) assert.equal(call.options.cwd, path);
      assert.equal(result.calls[3].args[1], `${path}\\new.txt`);
    });
  }
}

for (const path of ['C:relative', '\\\\server', '\\relative']) {
  test(`ambiguous Windows path allows without scanning another folder: ${path}`, () => {
    const result = scanner({ command: `git -C "${path}" commit`, cwd: '\\\\server\\share\\repo', shell: 'PowerShell' });
    assert.equal(result.reason, undefined);
    assert.equal(result.calls.length, 0);
  });
}

test('git -C resolves Windows relative paths without using process cwd', () => {
  const result = scanner({ command: 'git -C "other repo" commit', cwd: 'C:\\project' });
  assert.equal(result.calls.length, 3);
  for (const call of result.calls) assert.equal(call.options.cwd, 'C:\\project\\other repo');
});

for (const cwd of [undefined, '', 'relative']) {
  test(`missing or uncertain cwd allows: ${cwd}`, () => {
    assert.equal(scanner({ command: 'git commit', cwd }).calls.length, 0);
  });
}

for (const cwd of ['\\relative', '\\\\server', 'C:relative']) {
  test(`ambiguous Windows tool cwd allows without guessing: ${cwd}`, () => {
    const result = scanner({ command: 'git commit', cwd, shell: 'cmd' });
    assert.equal(result.calls.length, 0);
  });
}

for (const shape of [shapes[1], shapes[2]]) {
  test('UNC tool cwd is preserved for PowerShell and Antigravity', () => {
    const input = shape('git commit -a');
    const cwd = '\\\\server\\share\\repo';
    if (input.cwd) input.cwd = cwd;
    else input.toolCall.args.Cwd = cwd;
    const result = scanner(parseInput(JSON.stringify(input)));
    assert.equal(result.calls.length, 3);
    for (const call of result.calls) assert.equal(call.options.cwd, cwd);
  });
}

for (const phase of ['staged', 'unstaged', 'untracked']) {
  for (const failure of [1, 2, 'spawn']) {
    test(`${phase}: scanner failure ${failure} warns and allows`, () => {
      const result = scanner({ command: 'git add . && git commit -a', cwd: '/project' }, (command, args) => {
        if (command === 'git') return { status: 0, stdout: 'new.txt\0' };
        const current = args[0] === 'dir' ? 'untracked' : args.includes('--staged') ? 'staged' : 'unstaged';
        if (current !== phase) return ok;
        if (failure === 'spawn') throw Error('PRIVATE_DATA');
        return { status: failure, stderr: 'PRIVATE_DATA' };
      });
      assert.equal(result.reason, undefined);
      assert.equal(result.stderr, warning);
    });
  }
}

for (const result of [{ status: 1 }, { error: { code: 'ENOENT' }, status: null }, { status: null, signal: 'SIGTERM' }, undefined, { status: 99, error: Error('SECRET') }]) {
  test('missing, failed, or timed out gitleaks warns once and allows', () => {
    const output = scanner({ command: 'git commit', cwd: '/project' }, command => command === 'git' ? ok : result);
    assert.equal(output.reason, undefined);
    assert.equal(output.stderr, warning);
  });
}

test('a throwing runner warns without revealing its error', () => {
  const output = scanner({ command: 'git commit', cwd: '/project' }, () => { throw Error('SECRET'); });
  assert.equal(output.reason, undefined);
  assert.equal(output.stderr, warning);
});

for (const output of [{ status: 1, stdout: 'SECRET' }, { status: 0, stdout: 'unterminated' }, { status: 0, stdout: '../outside\0' }]) {
  test('failed or uncertain untracked listing warns and never scans another folder', () => {
    const result = scanner({ command: 'git commit', cwd: '/project' }, command => command === 'git' ? output : ok);
    assert.equal(result.calls.length, 3);
    assert.equal(result.reason, undefined);
    assert.equal(result.stderr, warning);
  });
}

for (const [name, shape] of [['Claude Code', shapes[1]], ['Codex', shapes[0]], ['Antigravity', shapes[2]]]) {
  for (const failure of ['missing', 'failed', 'throwing']) {
    test(`${name}: Windows ${failure} gitleaks warns immediately on stderr and allows`, async () => {
      const input = shape('git commit -m safe');
      if (input.cwd) input.cwd = 'C:\\project';
      else input.toolCall.args.Cwd = 'C:\\project';
      const stdout = capture();
      const stderr = capture();
      const warningBeforeNextProcess = [];
      let calls = 0;
      const exit = await runHook((input, options) => checkSecretScan(input, {
        ...options, runner(command) {
          if (calls++ > 0) warningBeforeNextProcess.push(stderr.text);
          if (command === 'git') return ok;
          if (failure === 'throwing') throw Error('PRIVATE_ERROR');
          return failure === 'missing'
            ? { status: null, error: Object.assign(Error('PRIVATE_PATH'), { code: 'ENOENT' }) }
            : { status: 1, stderr: 'PRIVATE_ERROR' };
        },
      }), { stdin: Readable.from([JSON.stringify(input)]), stdout, stderr });
      assert.equal(exit, 0);
      assert.equal(calls, 3);
      assert.deepEqual(warningBeforeNextProcess, [warning, warning]);
      assert.equal(stderr.text, warning);
      assert.equal(stdout.text, name === 'Antigravity' ? '{"decision":"allow"}\n' : '');
    });
  }
}
