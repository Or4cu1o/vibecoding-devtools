import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { statePath, readState, saveState, hashContent, kitVersion,
  writeAtomic, withLock, lockPath } from './state.mjs';
import { spawnSync } from 'node:child_process';

function environment(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-state-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home };
}

test('Missing state creates no directories; SHA-256 supports bytes', (t) => {
  const op = environment(t);
  assert.deepEqual(readState(op), { version: kitVersion, date: null, items: [] });
  assert.equal(fs.existsSync(statePath(op.home)), false);
  assert.equal(hashContent(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('Write and replace complete state with version and date without temporary files', (t) => {
  const op = environment(t);
  const items = [{ type: 'write', destination: path.join(op.home, 'x'), hash: hashContent('x'), owner: 'kit', cli: 'codex' }];
  saveState({ items }, op);
  const state = readState(op);
  assert.deepEqual(state.items, items);
  assert.equal(state.version, kitVersion);
  assert.ok(Number.isFinite(Date.parse(state.date)));
  saveState({ items: [] }, op);
  assert.deepEqual(readState(op).items, []);
  assert.deepEqual(fs.readdirSync(path.dirname(statePath(op.home))), ['state.json']);
});

test('Corrupt JSON and invalid formats are never ignored', (t) => {
  const op = environment(t);
  saveState({ items: [] }, op);
  fs.writeFileSync(statePath(op.home), '{');
  assert.throws(() => readState(op), SyntaxError);
  fs.writeFileSync(statePath(op.home), '{"version":"1","items":{}}');
  assert.throws(() => readState(op), /Invalid/);
});

test('Failed atomic rename preserves destination and cleans up temporary files', (t) => {
  const op = environment(t);
  fs.mkdirSync(statePath(op.home), { recursive: true });
  fs.writeFileSync(path.join(statePath(op.home), 'preserved'), 'original');
  assert.throws(() => saveState({ items: [] }, op));
  assert.equal(fs.readFileSync(path.join(statePath(op.home), 'preserved'), 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(path.dirname(statePath(op.home))), ['state.json']);
});

test('Failed temporary writes preserve destination and clean up temporary files', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'file');
  fs.writeFileSync(destination, 'version previous');
  const write = fs.writeFileSync;
  const failure = t.mock.method(fs, 'writeFileSync', (file, content, ...args) => {
    if (content === 'version new') {
      write(file, 've', ...args);
      throw new Error('ENOSPC simulated');
    }
    return write(file, content, ...args);
  });
  assert.throws(() => writeAtomic(destination, 'version new'), /ENOSPC/);
  failure.mock.restore();
  assert.equal(fs.readFileSync(destination, 'utf8'), 'version previous');
  assert.deepEqual(fs.readdirSync(op.home), ['file']);
});

test('Lock protects the full transaction from another process and releases after exceptions', (t) => {
  const op = environment(t);
  const url = new URL('./execute.mjs', import.meta.url).href;
  withLock(op.home, () => {
    const old = new Date(Date.now() - 86400000);
    fs.utimesSync(lockPath(op.home), old, old); // Live PIDs never expire based on age.
    const code = `import { execute } from ${JSON.stringify(url)};
      console.log(JSON.stringify(execute([{type:'write',owner:'kit',cli:'codex',
      destination:process.argv[1]+'/intruder',content:'B'}],{home:process.argv[1]})));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, op.home],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.ok, false);
    assert.match(result.errors[0].message, /active lock/);
    assert.equal(fs.existsSync(path.join(op.home, 'intruder')), false);
    saveState({ items: [] }, op);
  });
  assert.equal(fs.existsSync(lockPath(op.home)), false);
  assert.throws(() => withLock(op.home, () => { throw new Error('interruption'); }), /interruption/);
  assert.equal(fs.existsSync(lockPath(op.home)), false);
});

test('Recover dead-PID locks and preserve recent incomplete locks', (t) => {
  const op = environment(t);
  const child = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  assert.equal(child.status, 0);
  fs.mkdirSync(path.dirname(lockPath(op.home)));
  fs.writeFileSync(lockPath(op.home), JSON.stringify({ pid: child.pid, token: 'process-ended' }));
  assert.equal(withLock(op.home, () => 'recovered'), 'recovered');
  assert.equal(fs.existsSync(lockPath(op.home)), false);
  fs.writeFileSync(lockPath(op.home), '');
  assert.throws(() => withLock(op.home, () => assert.fail()), /active lock/);
  const stale = new Date(Date.now() - 60000);
  fs.utimesSync(lockPath(op.home), stale, stale);
  assert.equal(withLock(op.home, () => 'incomplete stale recovered'), 'incomplete stale recovered');
});

test('Dry-run creates no locks and failed atomic state rename preserves previous JSON', (t) => {
  const op = environment(t);
  withLock(op.home, () => assert.equal(fs.existsSync(lockPath(op.home)), false), { dryRun: true });
  assert.deepEqual(fs.readdirSync(op.home), []);
  saveState({ items: [] }, op);
  const previous = fs.readFileSync(statePath(op.home));
  const rename = fs.renameSync;
  const failure = t.mock.method(fs, 'renameSync', (source, destination) => {
    if (destination === statePath(op.home)) throw new Error('rename unavailable');
    return rename(source, destination);
  });
  assert.throws(() => saveState({ items: [{ type: 'command' }] }, op), /rename/);
  failure.mock.restore();
  assert.deepEqual(fs.readFileSync(statePath(op.home)), previous);
  assert.deepEqual(fs.readdirSync(path.dirname(statePath(op.home))), ['state.json']);
});

test('Failed lock metadata writes leave no incomplete lock', (t) => {
  const op = environment(t);
  const write = fs.writeFileSync;
  const failure = t.mock.method(fs, 'writeFileSync', (file, content, ...args) => {
    if (typeof content === 'string' && content.includes('"token"')) throw new Error('lock failure');
    return write(file, content, ...args);
  });
  assert.throws(() => withLock(op.home, () => assert.fail()), /lock failure/);
  failure.mock.restore();
  assert.equal(fs.existsSync(lockPath(op.home)), false);
  assert.equal(withLock(op.home, () => 'ok'), 'ok');
});
