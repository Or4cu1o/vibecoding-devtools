import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute, uninstall, START, END } from './execute.mjs';
import { readState, statePath, hashContent, saveState, withLock } from './state.mjs';
import { buildPlan } from './plan.mjs';
import { fileURLToPath } from 'node:url';

function environment(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-execute-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home };
}
const write = (destination, content = 'kit') => ({ type: 'write', owner: 'kit', cli: 'codex', destination, content });
const block = (destination, content = 'rules') => ({ ...write(destination, content), type: 'block' });
const cmd = (code, extra = {}) => ({ type: 'command', owner: 'ecc', cli: 'claude', cmd: process.execPath, args: ['-e', code], ...extra });

test('Dry-run lists files and commands without directories, state or effects', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'new', 'x');
  const r = execute([write(destination), block(path.join(op.home, 'AGENTS.md')), cmd('process.exit(9)')], { ...op, dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.actions.length, 3);
  assert.ok(r.actions.every((a) => a.status === 'planned'));
  assert.deepEqual(fs.readdirSync(op.home), []);
});

test('Skip identical external content, update owned files and respect local edits', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'x');
  fs.writeFileSync(destination, 'kit');
  const same = execute([{ ...write(destination), situation: 'same' }], op);
  assert.equal(same.ok, true);
  assert.equal(same.actions[0].status, 'same');
  assert.equal(fs.existsSync(statePath(op.home)), false);
  assert.equal(execute([write(destination, 'installed')], { ...op, force: true }).ok, true);
  assert.equal(execute([write(destination, 'updated')], op).ok, true);
  fs.writeFileSync(destination, 'edited');
  assert.equal(execute([write(destination)], op).conflicts.length, 1);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'edited');
  assert.equal(readState(op).items[0].hash, hashContent('updated'));
});

test('Copy a tree with binaries, record each file and preserve internal conflicts', (t) => {
  const op = environment(t);
  const source = path.join(op.home, 'source');
  const destination = path.join(op.home, 'destination');
  fs.mkdirSync(path.join(source, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(source, 'sub', 'bin'), Buffer.from([0, 255, 128]));
  fs.writeFileSync(path.join(source, 'a'), 'replacement');
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'a'), 'user');
  const action = { type: 'copy', owner: 'ecc', cli: 'claude', source, destination };
  assert.equal(execute([action], { ...op, dryRun: true }).conflicts.length, 1);
  assert.equal(fs.existsSync(path.join(destination, 'sub')), false);
  const r = execute([action], op);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(destination, 'sub', 'bin')), Buffer.from([0, 255, 128]));
  assert.equal(readState(op).items.length, 1);
  assert.equal(readState(op).items[0].owner, 'ecc');
  assert.equal(uninstall(op).ok, true);
  assert.equal(fs.existsSync(path.join(destination, 'sub', 'bin')), false);
  assert.equal(fs.readFileSync(path.join(destination, 'a'), 'utf8'), 'user');
});

test('Blocks preserve external bytes during installation, update and uninstall', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'AGENTS.md');
  const original = 'my rules\r\nwithout newline final';
  fs.writeFileSync(destination, original);
  assert.equal(execute([block(destination)], op).ok, true);
  assert.equal(execute([block(destination, 'new rules')], op).ok, true);
  fs.appendFileSync(destination, '\nmore rules\r\n');
  const before = fs.readFileSync(destination, 'utf8');
  assert.equal(uninstall({ ...op, dryRun: true }).actions.length, 1);
  assert.equal(fs.readFileSync(destination, 'utf8'), before);
  assert.equal(uninstall(op).ok, true);
  assert.equal(fs.readFileSync(destination, 'utf8'), original + '\nmore rules\r\n');
  assert.deepEqual(readState(op).items, []);
});

test('Unknown blocks conflict and modified blocks remain with warnings', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'AGENTS.md');
  fs.writeFileSync(destination, `before\n${START}\nuser\n${END}\nafter`);
  assert.equal(execute([block(destination)], op).conflicts.length, 1);
  assert.equal(execute([block(destination)], { ...op, force: true }).ok, true);
  fs.writeFileSync(destination, fs.readFileSync(destination, 'utf8').replace('rules', 'edited'));
  assert.equal(uninstall(op).warnings.length, 1);
  assert.equal(readState(op).items.length, 1);
  assert.match(fs.readFileSync(destination, 'utf8'), /edited/);
});

test('New blocks remove empty files; incomplete markers produce errors', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'AGENTS.md');
  execute([block(destination)], op);
  uninstall(op);
  assert.equal(fs.existsSync(destination), false);
  fs.writeFileSync(destination, START);
  assert.equal(execute([block(destination)], op).errors.length, 1);
  assert.equal(fs.readFileSync(destination, 'utf8'), START);
});

test('Uninstall retains modified files and forgets missing files', (t) => {
  const op = environment(t);
  const a = path.join(op.home, 'a');
  const b = path.join(op.home, 'b');
  const c = path.join(op.home, 'c');
  execute([write(a), write(b), write(c)], op);
  fs.writeFileSync(a, 'edit');
  fs.unlinkSync(b);
  const stateBefore = fs.readFileSync(statePath(op.home), 'utf8');
  const preview = uninstall({ ...op, dryRun: true });
  assert.equal(preview.warnings.length, 1);
  assert.equal(fs.readFileSync(statePath(op.home), 'utf8'), stateBefore);
  assert.equal(fs.existsSync(c), true);
  const r = uninstall(op);
  assert.equal(r.warnings.length, 1);
  assert.equal(fs.existsSync(c), false);
  assert.deepEqual(readState(op).items.map((i) => i.destination), [a]);
});

test('Commands receive literal args, cwd, environment and fake home with a recorded inverse', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'output.json');
  const unusual = 'spaces & | > $() "quotes" %PATH%';
  const code = 'require("node:fs").writeFileSync("output.json",JSON.stringify({arg:process.argv[1],cwd:process.cwd(),home:process.env.HOME,user:process.env.USERPROFILE,extra:process.env.VBD_TEST}))';
  const action = cmd(code, { args: ['-e', code, unusual], env: { VBD_TEST: 'value' }, uninstall: { cmd: process.execPath, args: ['-e', 'require("node:fs").unlinkSync("output.json")'] } });
  assert.equal(execute([action], op).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { arg: unusual, cwd: op.home, home: op.home, user: op.home, extra: 'value' });
  assert.equal(uninstall({ ...op, dryRun: true }).ok, true);
  assert.equal(fs.existsSync(destination), true);
  assert.equal(uninstall(op).ok, true);
  assert.equal(fs.existsSync(destination), false);
  assert.deepEqual(readState(op).items, []);
});

test('Commands without inverses remain registered with warnings; failures preserve progress', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'installed');
  const r = execute([write(destination), cmd('process.exit(7)'), write(path.join(op.home, 'skipped'))], op);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /7/);
  assert.equal(readState(op).items.length, 2);
  assert.equal(readState(op).items[1].pending, true);
  assert.equal(execute([cmd('process.exit(7)')], op).conflicts.length, 1);
  assert.equal(fs.existsSync(path.join(op.home, 'skipped')), false);
  assert.equal(execute([cmd('')], op).ok, true);
  assert.ok(uninstall(op).warnings.length >= 2);
  assert.equal(readState(op).items[0].type, 'command');
});

test('Identical actions and tree conflicts skip before expansion unless forced', (t) => {
  const op = environment(t);
  const source = path.join(op.home, 'source');
  const destination = path.join(op.home, 'destination');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'x'), 'kit');
  const action = { type: 'copy', owner: 'kit', cli: 'codex', source, destination };
  assert.equal(execute([{ ...action, situation: 'conflict' }], op).conflicts.length, 1);
  assert.equal(fs.existsSync(destination), false);
  assert.equal(execute([{ ...action, situation: 'same' }], op).actions[0].status, 'same');
  assert.equal(fs.existsSync(destination), false);
  assert.equal(execute([{ ...action, situation: 'conflict' }], { ...op, force: true }).ok, true);
  assert.equal(fs.readFileSync(path.join(destination, 'x'), 'utf8'), 'kit');
});

test('New and update actions revalidate changes made after planning', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'x');
  const newAction = { ...write(destination), situation: 'new' };
  fs.writeFileSync(destination, 'file external created later');
  assert.equal(execute([newAction], op).conflicts.length, 1);
  assert.equal(execute([newAction], { ...op, force: true }).ok, true);
  fs.writeFileSync(destination, 'edit after o summary');
  assert.equal(execute([{ ...write(destination, 'replacement'), situation: 'update' }], op).conflicts.length, 1);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'edit after o summary');
});

test('Confirmed commands never repeat for stale new plans', (t) => {
  const op = environment(t);
  const code = 'require("node:fs").appendFileSync("times.txt","x")';
  const action = { ...cmd(code), situation: 'new' };
  assert.equal(execute([action], op).ok, true);
  const repeated = execute([action], op);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.actions[0].status, 'same');
  assert.equal(fs.readFileSync(path.join(op.home, 'times.txt'), 'utf8'), 'x');
});

test('Atomic destination replacement failure preserves previous content and supports recovery', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'x');
  execute([write(destination, 'previous')], op);
  const rename = fs.renameSync;
  const failure = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === destination) throw new Error('failure before rename in destination');
    return rename(a, b);
  });
  const result = execute([write(destination, 'replacement')], op);
  failure.mock.restore();
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'previous');
  assert.equal(readState(op).items[0].pending, true);
  assert.equal(execute([write(destination, 'replacement')], op).ok, true);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'replacement');
  assert.equal(readState(op).items[0].pending, undefined);
  assert.equal(fs.readdirSync(op.home).some((n) => n.endsWith('.tmp')), false);
});

test('Pending state precedes effects and failed confirmation preserves ownership', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'x');
  const rename = fs.renameSync;
  let writes = 0;
  const failure = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === statePath(op.home) && ++writes === 2) throw new Error('failure ao confirm state');
    if (b === destination) assert.equal(readState(op).items[0].pending, true);
    return rename(a, b);
  });
  const result = execute([write(destination)], op);
  failure.mock.restore();
  assert.equal(result.ok, false);
  assert.equal(result.actions[0].status, 'pending');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'kit');
  assert.equal(readState(op).items[0].pending, true);
  assert.equal(execute([{ ...write(destination), situation: 'same' }], op).ok, true);
  assert.equal(readState(op).items[0].pending, undefined);
  assert.equal(uninstall(op).ok, true);
  assert.equal(fs.existsSync(destination), false);
});

test('Failed pending-state recording prevents effects; locally edited pending items remain', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'x');
  const rename = fs.renameSync;
  const failure = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === statePath(op.home)) throw new Error('state unavailable');
    return rename(a, b);
  });
  assert.equal(execute([write(destination)], op).ok, false);
  assert.equal(fs.existsSync(destination), false);
  failure.mock.restore();
  fs.writeFileSync(destination, 'change local');
  saveState({ items: [{ ...write(destination), pending: true, operation: 'install', previous: null,
    hash: hashContent('kit'), hashBefore: null, diskHash: hashContent('kit') }] }, op);
  assert.equal(execute([write(destination)], op).conflicts.length, 1);
  assert.equal(uninstall(op).warnings.length >= 1, true);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'change local');
  assert.equal(readState(op).items[0].pending, true);
});

test('Hashes recover pending removals including blocks with external context', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'AGENTS.md');
  fs.writeFileSync(destination, 'user\n');
  execute([block(destination)], op);
  const rename = fs.renameSync;
  let writes = 0;
  const failure = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === statePath(op.home) && ++writes === 2) throw new Error('failure in state after remove block');
    return rename(a, b);
  });
  assert.equal(uninstall(op).ok, false);
  failure.mock.restore();
  assert.equal(fs.readFileSync(destination, 'utf8'), 'user\n');
  assert.equal(readState(op).items[0].operation, 'remove');
  assert.equal(uninstall(op).ok, true);
  assert.deepEqual(readState(op).items, []);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'user\n');
});

test('Blocks reject UTF-16 and invalid UTF-8 without changing bytes even with force', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'AGENTS.md');
  for (const bytes of [Buffer.from([255, 254, 65, 0]), Buffer.from([254, 255, 0, 65]), Buffer.from([128, 255])]) {
    fs.writeFileSync(destination, bytes);
    const result = execute([block(destination)], { ...op, force: true });
    assert.equal(result.conflicts.length, 1);
    assert.deepEqual(fs.readFileSync(destination), bytes);
  }
  assert.deepEqual(readState(op).items, []);
});

test('Windows resolves extensionless commands through PATH and PATHEXT and protects arguments',
  { skip: process.platform !== 'win32' }, (t) => {
    const op = environment(t);
    const directory = path.join(op.home, 'directory with space');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'wrapper.cmd'), '@echo off\r\n> "%~3" echo "[%~1][%~2]"\r\n');
    const action = { type: 'command', owner: 'ecc', cli: 'claude', cmd: 'wrapper',
      args: ['um space', 'a&b', 'result.txt'], env: { PATH: directory, PATHEXT: '.EXE;.CMD' } };
    assert.equal(execute([action], op).ok, true);
    assert.equal(fs.readFileSync(path.join(op.home, 'result.txt'), 'utf8').trim(), '"[um space][a&b]"');
    for (const arg of ['%PATH%', 'a"&echo danger', '!VAR!', 'a\nb']) {
      assert.equal(execute([{ ...action, args: [arg] }], op).ok, false);
    }
  });

test('Active locks prevent concurrent execution from changing files or losing records', (t) => {
  const op = environment(t);
  withLock(op.home, () => {
    const r = execute([write(path.join(op.home, 'blocked'))], op);
    assert.equal(r.ok, false);
    assert.match(r.errors[0].message, /active lock/);
    assert.equal(fs.existsSync(path.join(op.home, 'blocked')), false);
  });
  assert.equal(execute([write(path.join(op.home, 'free'))], op).ok, true);
});

test('Real kit integration covers planning, installation, repetition, block update and uninstall', (t) => {
  const op = environment(t);
  const project = path.join(op.home, 'project with space');
  const paths = { ...op, project, kit: fileURLToPath(new URL('../', import.meta.url)), ecc: null };
  const choices = { clis: ['claude', 'codex', 'agy'], scope: 'project', maestri: false, ecc: { clis: [] } };
  const plan = buildPlan(choices, {}, paths);
  const first = execute(plan, op);
  assert.equal(first.ok, true, JSON.stringify(first.errors));
  const agents = path.join(project, 'AGENTS.md');
  assert.deepEqual(readState(op).items.filter((i) => i.destination === agents).map((i) => i.type), ['copy', 'block']);
  const repeated = buildPlan(choices, {}, paths);
  assert.ok(repeated.every((a) => a.situation === 'same'));
  assert.equal(execute(repeated, op).ok, true);
  const updated = buildPlan({ ...choices, maestri: true }, {}, paths);
  assert.equal(updated.find((a) => a.type === 'block').situation, 'update');
  assert.equal(execute(updated, op).ok, true);
  const before = fs.readFileSync(agents);
  const preview = uninstall({ ...op, dryRun: true });
  assert.equal(preview.ok, true);
  assert.equal(preview.warnings.length, 0);
  assert.deepEqual(fs.readFileSync(agents), before);
  assert.equal(uninstall(op).ok, true);
  assert.deepEqual(readState(op).items, []);
  assert.equal(fs.existsSync(agents), false);
  assert.equal(fs.existsSync(path.join(project, 'CLAUDE.md')), false);
});

test('Removing blocks before files preserves external user edits in templates', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'AGENTS.md');
  execute([write(destination, '# Template\n'), block(destination)], op);
  fs.appendFileSync(destination, '\n# My edit\n');
  const result = uninstall(op);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(fs.readFileSync(destination, 'utf8'), '# Template\n\n# My edit\n');
  assert.equal(readState(op).items[0].type, 'write');
});

test('Missing commands and string args produce errors without state writes', (t) => {
  const op = environment(t);
  assert.equal(execute([cmd('', { cmd: path.join(op.home, 'nonexistent') })], op).ok, false);
  assert.equal(execute([cmd('', { args: '--version' })], op).ok, false);
  assert.equal(fs.existsSync(statePath(op.home)), false);
});

test('Windows runs cmd and bat files through cmd.exe with quoted arguments', { skip: process.platform !== 'win32' }, (t) => {
  const op = environment(t);
  for (const ext of ['cmd', 'bat']) {
    const script = path.join(op.home, `with space.${ext}`);
    fs.writeFileSync(script, '@echo off\r\n> "%~3" echo "[%~1][%~2]"\r\n');
    const action = cmd('', { cmd: script, args: ['um space', 'a&b', 'result.txt'] });
    const r = execute([action], op);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(fs.readFileSync(path.join(op.home, 'result.txt'), 'utf8').trim(), '"[um space][a&b]"');
  }
});

test('Copy rejects junctions and destinations inside the source', (t) => {
  const op = environment(t);
  const source = path.join(op.home, 'source');
  const external = path.join(op.home, 'external');
  const link = path.join(op.home, 'link');
  fs.mkdirSync(source);
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'x'), 'user');
  fs.symlinkSync(external, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(execute([write(path.join(link, 'x'))], { ...op, force: true }).errors.length, 1);
  assert.equal(fs.readFileSync(path.join(external, 'x'), 'utf8'), 'user');
  assert.equal(execute([{ type: 'copy', owner: 'kit', cli: 'codex', source, destination: path.join(source, 'inside') }], op).errors.length, 1);
});

test('Copy single files and empty directories; dry-run lists directories without creating them', (t) => {
  const op = environment(t);
  const source = path.join(op.home, 'source');
  const destination = path.join(op.home, 'directory');
  fs.mkdirSync(source);
  const action = { type: 'copy', owner: 'kit', cli: 'claude', source, destination };
  assert.equal(execute([action], { ...op, dryRun: true }).actions.length, 1);
  assert.equal(fs.existsSync(destination), false);
  assert.equal(execute([action], op).ok, true);
  assert.equal(fs.statSync(destination).isDirectory(), true);
  fs.writeFileSync(path.join(source, 'x'), 'bytes');
  assert.equal(execute([{ ...action, source: path.join(source, 'x'), destination: path.join(destination, 'x') }], op).ok, true);
  assert.equal(fs.readFileSync(path.join(destination, 'x'), 'utf8'), 'bytes');
});

test('Failed uninstall stops removal and preserves the record for retry', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'x');
  execute([write(destination), cmd('', { uninstall: { cmd: process.execPath, args: ['-e', 'process.exit(8)'] } })], op);
  const r = uninstall(op);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /8/);
  assert.equal(fs.existsSync(destination), true);
  assert.equal(readState(op).items.length, 2);
});
