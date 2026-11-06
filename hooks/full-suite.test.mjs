import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFullSuite, FULL_SUITE_REASON, isFullSuite } from './full-suite.mjs';
import { runHook } from './lib/io.mjs';

const full = [
  'pytest', 'pytest -q', 'pytest -vv --maxfail=1', 'python -m pytest', 'python3 -m pytest --tb short',
  'py.exe -m pytest', 'npm test', 'pnpm test', 'yarn test', 'npm run test',
  'npm test -- --coverage', 'pnpm test -- --runInBand', 'yarn test --silent',
  'npx vitest run', 'npx vitest run --coverage --reporter verbose', 'npx jest', 'npx jest --ci --runInBand',
  'go test ./...', 'go test -race ./... -count=1', 'cargo test', 'cargo test --workspace --all-features',
];
const scoped = [
  'pytest tests/test_one.py', 'pytest tests/test_one.py::test_case', 'pytest -k changed', 'pytest -m unit',
  'pytest --lf', 'pytest --stepwise', 'pytest --unknown', 'pytest --maxfail', 'pytest -- -q',
  'npm test -- changed.test.js', 'npm test -- --testNamePattern changed', 'pnpm test --filter project',
  'yarn test one.test.js', 'npm --prefix other test', 'npm test -- --config other.json',
  'npx vitest run changed.test.js', 'npx vitest run -t changed', 'npx jest --testPathPattern changed',
  'npx jest changed', 'npx jest --findRelatedTests changed.js', 'npx jest --onlyChanged',
  'go test ./pkg', 'go test ./... -run Changed', 'go test ./... -args filter',
  'cargo test changed', 'cargo test --test integration', 'cargo test -p package', 'cargo test --no-run',
  'echo pytest', 'npm install', 'npx vitest', 'go build ./...', 'cargo check',
];

function repository(t, marker = '.github/workflows/tests.yml') {
  const cwd = mkdtempSync(join(tmpdir(), 'full-suite-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.git'));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }));
  if (marker) {
    if (marker === '.circleci') mkdirSync(join(cwd, marker));
    else {
      const parts = marker.split('/');
      parts.pop();
      mkdirSync(join(cwd, ...parts), { recursive: true });
      writeFileSync(join(cwd, marker), 'CI fixture');
    }
  }
  return cwd;
}

test('recognizes whole suites and allows scoped or unknown options', t => {
  const cwd = repository(t);
  for (const command of full) assert.equal(checkFullSuite({ command, cwd }), FULL_SUITE_REASON, command);
  for (const command of scoped) assert.equal(checkFullSuite({ command, cwd }), undefined, command);
});

for (const marker of ['.github/workflows/tests.yml', '.github/workflows/tests.yaml', '.gitlab-ci.yml', 'azure-pipelines.yml', '.circleci']) {
  test(`detects CI marker ${marker} only for repository-wide commands`, t => {
    const root = repository(t, marker);
    const cwd = join(root, 'src', 'nested');
    mkdirSync(cwd, { recursive: true });
    assert.equal(checkFullSuite({ command: 'pytest', cwd: root }), FULL_SUITE_REASON);
    assert.equal(checkFullSuite({ command: 'pytest', cwd }), undefined);
  });
}

test('CI is required and workflow entries must be YAML files', t => {
  for (const marker of [null, '.github/workflows/README.md']) {
    const cwd = repository(t, marker);
    assert.equal(checkFullSuite({ command: 'pytest', cwd }), undefined);
  }
  const cwd = repository(t, null);
  mkdirSync(join(cwd, '.github', 'workflows', 'directory.yml'), { recursive: true });
  assert.equal(checkFullSuite({ command: 'pytest', cwd }), undefined);
  assert.equal(checkFullSuite({ command: 'pytest', cwd: join(cwd, 'missing') }), undefined);
});

test('does not inherit CI from outside a nested repository or worktree', t => {
  const root = repository(t);
  for (const worktree of [false, true]) {
    const cwd = join(root, worktree ? 'worktree' : 'repo');
    mkdirSync(cwd);
    if (worktree) writeFileSync(join(cwd, '.git'), 'gitdir: elsewhere');
    else mkdirSync(join(cwd, '.git'));
    assert.equal(checkFullSuite({ command: 'cargo test', cwd }), undefined);
  }
});

test('literal overrides allow POSIX, cmd and PowerShell commands', t => {
  const cwd = repository(t);
  for (const command of [
    'VIBECODING_FULL_SUITE=1 pytest', 'env VIBECODING_FULL_SUITE=1 npm test',
    'set VIBECODING_FULL_SUITE=1 && npm test', '$env:VIBECODING_FULL_SUITE=1; npm test',
    '$env:VIBECODING_FULL_SUITE = \'1\'; npm test',
  ]) assert.equal(checkFullSuite({ command, cwd }), undefined, command);
  assert.equal(checkFullSuite({ command: 'VIBECODING_FULL_SUITE=0 pytest', cwd }), FULL_SUITE_REASON);
});

test('handles command chains, literal environment prefixes and PowerShell invocation', t => {
  const cwd = repository(t);
  for (const command of [
    'git status && pytest', 'npm test; echo done', 'CI=1 pytest', 'env CI=1 pytest',
    '& npm.cmd test', '& "C:\\Program Files\\nodejs\\npm.cmd" test',
    'C:\\Python\\pytest.exe -q', 'npx.cmd jest',
  ]) assert.equal(checkFullSuite({ command, cwd, shell: 'PowerShell' }), FULL_SUITE_REASON, command);
});

test('uncertain commands and cwd allow without consulting the filesystem', () => {
  const fs = { statSync() { assert.fail('must not consult filesystem'); } };
  for (const command of [
    'cd other && npm test', 'Set-Location other; pytest', 'pushd other; cargo test',
    'export CONFIG=other; pytest', 'set CONFIG=other && pytest', '. setup; npm test',
    'pytest "$args"', 'npm test > output.txt', 'pytest "unterminated', '$(runner) test',
    ...scoped,
  ]) assert.equal(checkFullSuite({ command, cwd: '/repo' }, { fs }), undefined, command);
  for (const cwd of [undefined, '', 'relative', 'C:relative', '\\relative', '\\\\server']) {
    assert.equal(checkFullSuite({ command: 'pytest', cwd }, { fs }), undefined);
  }
});

test('filesystem failures allow without disclosing errors', () => {
  for (const code of ['EACCES', 'EIO']) {
    const fs = { statSync() { throw Object.assign(Error('private'), { code }); } };
    assert.equal(checkFullSuite({ command: 'pytest', cwd: '/repo' }, { fs }), undefined);
  }
  const fs = {
    statSync() { return { isDirectory: () => true }; },
    readdirSync() { throw Error('private'); },
  };
  assert.equal(checkFullSuite({ command: 'pytest', cwd: '/repo' }, { fs }), undefined);
});

test('Windows drive and UNC paths distinguish repository and package scope on every host', () => {
  for (const root of ['C:\\repo', '\\\\server\\share\\repo']) {
    const seen = [];
    const fs = {
      statSync(path) {
        seen.push(path);
        return { isDirectory: () => [root, `${root}\\src`, `${root}\\.git`].includes(path), isFile: () => path === `${root}\\.gitlab-ci.yml` };
      },
    };
    assert.equal(checkFullSuite({ command: 'pytest.exe', cwd: `${root}\\src`, shell: 'pwsh.exe' }, { fs }), undefined);
    assert.equal(checkFullSuite({ command: 'pytest.exe', cwd: root, shell: 'pwsh.exe' }, { fs }), FULL_SUITE_REASON);
    assert.ok(seen.includes(`${root}\\.gitlab-ci.yml`));
    assert.equal(seen.some(path => path.includes('/')), false);
  }
});

const shapes = [
  command => ({ tool_name: 'Bash', tool_input: { command } }),
  command => ({ tool_name: 'PowerShell', tool_input: { command } }),
  command => ({ toolCall: { name: 'run_command', args: { CommandLine: command } } }),
];
for (const [index, shape] of shapes.entries()) {
  for (const deny of [false, true]) {
    test(`input shape ${index}: ${deny ? 'deny' : 'allow'} wire format`, async t => {
      const cwd = repository(t);
      const input = shape(deny ? 'npm test' : 'npm test -- changed.test.js');
      if (input.toolCall) input.toolCall.args.Cwd = cwd;
      else input.cwd = cwd;
      const stdout = { text: '', write(value) { this.text += value; } };
      const stderr = { text: '', write(value) { this.text += value; } };
      const exit = await runHook(checkFullSuite, { stdin: Readable.from([JSON.stringify(input)]), stdout, stderr });
      assert.equal(exit, index === 2 ? 0 : deny ? 2 : 0);
      assert.equal(stdout.text, index === 2
        ? `${JSON.stringify(deny ? { decision: 'deny', reason: FULL_SUITE_REASON } : { decision: 'allow' })}\n` : '');
      assert.equal(stderr.text, index !== 2 && deny ? `${FULL_SUITE_REASON}\n` : '');
    });
  }
}

test('denial reason is short and shell-safe', () => {
  assert.doesNotMatch(FULL_SUITE_REASON, /["`$]/);
  assert.equal(isFullSuite(['pytest', '-k', 'changed']), false);
});

test('T-45 finding 1: PowerShell location cmdlets and aliases leave repository context uncertain', t => {
  const cwd = repository(t);
  const other = repository(t, null);
  for (const change of ['Push-Location', 'Pop-Location', 'Set-Location', 'sl', 'cd', 'chdir', 'pushd', 'popd', 'PUSH-LOCATION']) {
    const command = `${change} '${other}'; pytest`;
    assert.equal(checkFullSuite({ command, cwd, shell: 'PowerShell' }), undefined, command);
  }
  assert.equal(checkFullSuite({ command: '& Push-Location elsewhere; pytest', cwd, shell: 'pwsh.exe' }), undefined);
  assert.equal(checkFullSuite({ command: 'pytest', cwd, shell: 'PowerShell' }), FULL_SUITE_REASON);
});

test('T-45 finding 2: unused functions and unsupported control structures allow', t => {
  const cwd = repository(t);
  for (const command of [
    'function Invoke-Tests {\npytest\n}\necho done',
    'function Invoke-Tests { pytest }; echo done',
    'if false; then\npytest\nfi',
    'foreach item in things\npytest\nend',
    'try {\npytest\n} catch { echo done }',
    '{\npytest\n}',
  ]) assert.equal(checkFullSuite({ command, cwd, shell: 'PowerShell' }), undefined, command);
});

for (const manager of ['npm test', 'pnpm test', 'yarn test', 'npm run test', 'pnpm run test', 'yarn run test']) {
  test(`T-45 finding 3: ${manager} inspects the literal test script`, t => {
    const cwd = repository(t);
    const packageFile = join(cwd, 'package.json');
    for (const script of [
      'vitest run src/one.test.js', 'vitest --watch', 'vitest run --watch', 'jest --watch',
      'pnpm --filter one test', 'npm --workspace one test', 'jest --config packages/one/jest.config.js',
      'cargo test -p one', 'node custom-test-runner.mjs', 'npm test', 'npx npm test',
      'node --test src/one.test.mjs', 'node --test --test-name-pattern=changed', 'node --test --watch',
      'echo prepare && jest', 'CI=1 jest', 'jest "$FILTER"',
    ]) {
      writeFileSync(packageFile, JSON.stringify({ scripts: { test: script } }));
      assert.equal(checkFullSuite({ command: manager, cwd }), undefined, script);
    }
    for (const script of ['vitest run', 'npx vitest run', 'jest --ci', 'npx jest', 'pytest -q', 'node --test']) {
      writeFileSync(packageFile, JSON.stringify({ scripts: { test: script } }));
      assert.equal(checkFullSuite({ command: manager, cwd }), FULL_SUITE_REASON, script);
      assert.equal(checkFullSuite({ command: `${manager} -- changed.test.js`, cwd }), undefined);
    }
    for (const scripts of [{}, { test: 42 }, { test: 'jest', pretest: 'node setup.mjs' }, { test: 'jest', posttest: 'node cleanup.mjs' }]) {
      writeFileSync(packageFile, JSON.stringify({ scripts }));
      assert.equal(checkFullSuite({ command: manager, cwd }), undefined);
    }
    writeFileSync(packageFile, '{');
    assert.equal(checkFullSuite({ command: manager, cwd }), undefined);
    rmSync(packageFile);
    assert.equal(checkFullSuite({ command: manager, cwd }), undefined);
  });
}

test('T-45 finding 3: inaccessible package scripts allow', t => {
  const cwd = repository(t);
  let reads = 0;
  const fs = {
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: () => ['ci.yml'],
    readFileSync() { reads++; throw Object.assign(Error('private'), { code: 'EACCES' }); },
  };
  // A regular workflow file is needed before script inspection.
  fs.statSync = path => ({ isDirectory: () => true, isFile: () => path.endsWith('ci.yml') });
  assert.equal(checkFullSuite({ command: 'npm test', cwd }, { fs }), undefined);
  assert.equal(reads, 1);
});

test('T-45 finding 4: monorepo package commands are scoped even with root CI', t => {
  const root = repository(t);
  const cwd = join(root, 'packages', 'one');
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, 'go.mod'), 'module example/one');
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
  for (const command of ['go test ./...', 'cargo test', 'pytest', 'npx jest', 'npm test', 'pnpm test', 'yarn test']) {
    assert.equal(checkFullSuite({ command, cwd }), undefined, command);
    assert.equal(checkFullSuite({ command, cwd: root }), FULL_SUITE_REASON, command);
  }
  assert.equal(checkFullSuite({ command: 'go test ./...', cwd: join(root, 'missing') }), undefined);
});

test('T-45 finding 5: only a complete override token with value 1 bypasses', t => {
  const cwd = repository(t);
  for (const command of [
    'VIBECODING_FULL_SUITE=10 pytest', 'VIBECODING_FULL_SUITE=01 pytest',
    'VIBECODING_FULL_SUITE=1extra pytest', 'MY_VIBECODING_FULL_SUITE=1 pytest',
    'env PREFIX_VIBECODING_FULL_SUITE=1 pytest', 'VIBECODING_FULL_SUITE=1/path pytest',
    'echo "VIBECODING_FULL_SUITE=1 extra"; pytest', '# VIBECODING_FULL_SUITE=1\npytest',
    '$env:VIBECODING_FULL_SUITE=10; pytest', '$env:VIBECODING_FULL_SUITE = \'01\'; pytest',
    'set VIBECODING_FULL_SUITE=10 && pytest', 'set "VIBECODING_FULL_SUITE=01" && pytest',
  ]) assert.equal(checkFullSuite({ command, cwd, shell: 'PowerShell' }), FULL_SUITE_REASON, command);
  for (const command of [
    'VIBECODING_FULL_SUITE=1 pytest', 'env VIBECODING_FULL_SUITE=1 pytest',
    'VIBECODING_FULL_SUITE=\'1\' pytest', 'set "VIBECODING_FULL_SUITE=1" && pytest',
    '$env:VIBECODING_FULL_SUITE = "1"; pytest',
  ]) assert.equal(checkFullSuite({ command, cwd, shell: 'PowerShell' }), undefined, command);
});

test('T-52: Claude Bash denies npm test for a node --test package script with CI', async t => {
  const cwd = repository(t, '.github/workflows/ci.yml');
  const packageFile = join(cwd, 'package.json');
  const cases = [
    ['node --test', 'npm test', true],
    ['node --test', 'npm test -- src/one.test.mjs', false],
    ['node --test', 'VIBECODING_FULL_SUITE=1 npm test', false],
    ['node --test', 'VIBECODING_FULL_SUITE=10 npm test', true],
    ['node --test src/one.test.mjs', 'npm test', false],
    ['node --test "src/*.test.mjs"', 'npm test', false],
    ['node --test --test-name-pattern changed', 'npm test', false],
    ['node --test --test-name-pattern=changed', 'npm test', false],
    ['node --test --test-skip-pattern=slow', 'npm test', false],
    ['node --test --test-shard=1/2', 'npm test', false],
    ['node --test --watch', 'npm test', false],
    ['node --test --unknown', 'npm test', false],
    ['node custom-test-runner.mjs', 'npm test', false],
    ['vitest run src/one.test.js', 'npm test', false],
  ];
  for (const [script, command, deny] of cases) {
    writeFileSync(packageFile, JSON.stringify({ scripts: { test: script } }));
    const input = { tool_name: 'Bash', tool_input: { command }, cwd };
    const stdout = { text: '', write(value) { this.text += value; } };
    const stderr = { text: '', write(value) { this.text += value; } };
    const exit = await runHook(checkFullSuite, { stdin: Readable.from([JSON.stringify(input)]), stdout, stderr });
    assert.equal(exit, deny ? 2 : 0, `${script}: ${command}`);
    assert.equal(stdout.text, '');
    assert.equal(stderr.text, deny ? `${FULL_SUITE_REASON}\n` : '');
  }
});

test('T-52: literal Node test discovery recognizes no path and fails open on selectors', () => {
  for (const words of [['node', '--test'], ['node.exe', '--test'], ['C:\\nodejs\\node.exe', '--test', '--test-reporter=spec']]) {
    assert.equal(isFullSuite(words), true);
  }
  for (const words of [
    ['node', '--test', 'src/one.test.mjs'], ['node', '--test', '--test-name-pattern', 'changed'],
    ['node', '--test', '--watch'], ['node', '--test', '--unknown'], ['node', 'custom-runner.mjs'],
  ]) assert.equal(isFullSuite(words), false);
});

test('T-54: real stdin JSON reaches the full-suite executable with native and forward-slash cwd', t => {
  const root = repository(t, '.github/workflows/ci.yml');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  for (const cwd of new Set([root, root.replaceAll('\\', '/')])) {
    for (const shape of shapes) {
      for (const [command, deny] of [
        ['npm test', true], ['npm test -- one.test.mjs', false],
        ['VIBECODING_FULL_SUITE=1 npm test', false], ['VIBECODING_FULL_SUITE=10 npm test', true],
      ]) {
        const input = shape(command);
        if (input.toolCall) input.toolCall.args.Cwd = cwd;
        else input.cwd = cwd;
        const payload = JSON.stringify(input);
        if (process.platform === 'win32' && cwd.includes('\\')) assert.ok(payload.includes('\\\\'));
        const result = spawnSync(process.execPath, [fileURLToPath(new URL('./full-suite.mjs', import.meta.url))], {
          input: Buffer.from(payload), encoding: 'utf8', windowsHide: true,
        });
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.equal(result.status, input.toolCall ? 0 : deny ? 2 : 0, payload);
        assert.equal(result.stdout, input.toolCall
          ? `${JSON.stringify(deny ? { decision: 'deny', reason: FULL_SUITE_REASON } : { decision: 'allow' })}\n` : '');
        assert.equal(result.stderr, !input.toolCall && deny ? `${FULL_SUITE_REASON}\n` : '');
      }
    }
  }
});
