// teamMain end to end against a stateful fake `maestri`, fake CLI probes and a temporary home folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { teamMain } from './team.mjs';

const kit = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(kit, 'team', 'team.json'), 'utf8'));
const READS = new Set(['list', 'role list', 'role show', 'preset list', 'preset show', 'partitura list']);
const isRead = (args) => READS.has(args.slice(0, 2).join(' ')) || READS.has(args[0]);
const flag = (args, name) => args[args.indexOf(name) + 1];

// Keeps what Maestri would keep; `failOn` makes one matching command fail once, like a recruit that errors midway.
function fakeMaestri({ failOn } = {}) {
  const s = { roles: new Map(), presets: new Map(), agents: new Map(), notes: new Set(), portals: new Set(),
    ficharios: new Set(), partituras: new Set(), ropes: new Set(), calls: [], created: [] };
  let pending = failOn;
  const created = (key) => s.created.push(key);
  const commands = {
    list: () => ['You:', '  - name: "Me", role: "Maestro", maestro: true', '', 'Connected agents:',
      ...[...s.agents].map(([n, r]) => `  - name: "${n}", role: "${r}"`), '', 'Connected portals (use x):',
      ...[...s.portals].map((n) => `  - name: "${n}" - url: https://x`), '', 'Connected notes (use y):',
      ...[...s.ficharios].map((n) => `  fichário "${n}":`), ...[...s.notes].map((n) => `  - name: "${n}"`)].join('\n'),
    'role list': () => [...s.roles.keys()].map((n) => `  - "${n}" — x`).join('\n'),
    'role show': ([, , name]) => `Role: ${name}\n\n${s.roles.get(name)}`,
    'role create': ([, , name, text]) => { s.roles.set(name, text); created(`role:${name}`); },
    'role write': ([, , name, text]) => { s.roles.set(name, text); },
    'preset list': () => [...s.presets.keys()].map((n) => `  - "${n}"`).join('\n'),
    'preset show': ([, , name]) => {
      const { command, maestro } = s.presets.get(name);
      return `Preset: ${name}\nCommand: ${command}\nMaestro: ${maestro}\n`;
    },
    'preset create': (a) => {
      s.presets.set(a[2], { command: flag(a, '--command'), maestro: flag(a, '--maestro') });
      created(`preset:${a[2]}`);
    },
    recruit: ([, name, , role]) => { s.agents.set(name, role); created(`agent:${name}`); },
    connect: ([, a, b]) => {
      const key = [a, b].sort().join('|');
      if (s.ropes.has(key)) return 'already connected';
      s.ropes.add(key);
      return 'connected';
    },
    'note create': (a) => {
      s.notes.add(flag(a, '--name'));
      if (a.includes('--stack')) s.ficharios.add(flag(a, '--stack'));
      created(`note:${flag(a, '--name')}`);
    },
    'portal create': ([, , , name]) => { s.portals.add(name); created(`portal:${name}`); },
    'partitura list': () => [...s.partituras].map((n) => `  - "${n}" (global)`).join('\n'),
    'partitura create': ([, , name]) => { s.partituras.add(name); created(`partitura:${name}`); },
  };
  s.run = (bin, args) => {
    s.calls.push(args);
    if (pending?.(args)) {
      pending = undefined;
      throw Object.assign(new Error('failed'), { stderr: Buffer.from('maestri: boom') });
    }
    const handler = commands[args.slice(0, 2).join(' ')] ?? commands[args[0]];
    return handler(args) ?? '';
  };
  s.mutations = () => s.calls.filter((a) => !isRead(a));
  return s;
}

const modelsOf = (bin) => manifest.agents.map((a) => a.command ?? '').filter((c) => c.startsWith(`${bin} `))
  .map((c) => c.match(/(?:--model|-m) (\S+)/)[1]);
const okTools = (over = {}) => ({
  onPath: () => true,
  codexModels: () => JSON.stringify({ models: modelsOf('codex').map((slug) => ({ slug })) }),
  agyModels: () => modelsOf('agy').map((id) => `${id}\tName`).join('\n'),
  claudePlugins: () => '  ❯ ecc@ecc\n',
  ...over,
});

function session(t, { maestri = fakeMaestri(), tools = okTools() } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'team-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const log = { out: [], err: [] };
  // `env: {}` keeps a MAESTRI_CLI set in the terminal running the tests from replacing the `maestri` binary name.
  const team = (...argv) => teamMain(argv, { kit, home, tools, env: {}, run: maestri.run,
    out: (m) => log.out.push(m), err: (m) => log.err.push(m) });
  const settings = path.join(home, '.vibecoding-devtools', 'team', 'task-runner-limited.json');
  return { maestri, home, log, team, settings };
}

test('a run that fails midway is finished by running the same command again, without duplicates', async (t) => {
  const failures = [
    (a) => a[0] === 'recruit' && a[1] === 'Forja',
    (a) => a[0] === 'connect' && a[1] === 'Regente' && a[2] === 'Sentinela',
    (a) => a[0] === 'note' && flag(a, '--name') === 'Decisions',
    (a) => a[0] === 'partitura' && a[1] === 'create',
  ];
  for (const failOn of failures) {
    const { maestri, log, team } = session(t, { maestri: fakeMaestri({ failOn }) });
    assert.equal(await team(), 1);
    const message = log.err.join('\n');
    assert.match(message, /maestri: boom/);
    assert.match(message, /Stopped at step \d+ of \d+ \(\d+ done\)\. Run the same command again to resume/);
    assert.equal(maestri.partituras.size, 0);

    assert.equal(await team(), 0);
    assert.deepEqual([...maestri.agents.keys()].sort(), manifest.agents.map((a) => a.name).sort());
    assert.ok(maestri.partituras.has(manifest.partitura.name));
    assert.ok(maestri.notes.has('Decisions') && maestri.portals.has('Gemini'));
    assert.equal(new Set(maestri.created).size, maestri.created.length, 'nothing is created twice');

    const before = maestri.created.length;
    assert.equal(await team(), 0);
    assert.equal(maestri.created.length, before, 'a third run creates nothing');
  }
});

test('missing prerequisites stop the run before any maestri command, exit 1, all listed', async (t) => {
  const tools = okTools({ onPath: (bin) => bin !== 'agy', claudePlugins: () => '  ❯ impeccable@impeccable\n',
    codexModels: () => JSON.stringify({ models: [] }) });
  for (const argv of [[], ['--dry-run']]) {
    const { maestri, log, team, home } = session(t, { tools });
    assert.equal(await team(...argv), 1);
    assert.deepEqual(maestri.calls, []);
    assert.equal(fs.existsSync(path.join(home, '.vibecoding-devtools')), false);
    const message = log.err.join('\n');
    assert.match(message, /Nothing changed\. Missing prerequisites:/);
    for (const part of ['agy is not on PATH', 'is not in codex debug models', 'ECC is not installed']) {
      assert.ok(message.includes(part), part);
    }
  }
});

test('--dry-run reports the prerequisites, prints the file and commands, and writes and changes nothing', async (t) => {
  const { maestri, log, team, home, settings } = session(t);
  assert.equal(await team('--dry-run'), 0);
  assert.equal(log.out[0], 'Prerequisites found.');
  assert.ok(log.out.includes(`write ${settings}`));
  const formiga = log.out.find((line) => line.startsWith('maestri recruit Formiga'));
  // The command is shown as a quoted string, so backslashes in a Windows path appear escaped.
  assert.ok(formiga.includes(`--settings ${JSON.stringify(settings).slice(1, -1)}`));
  assert.deepEqual(maestri.mutations(), []);
  assert.equal(fs.existsSync(path.join(home, '.vibecoding-devtools')), false);
});

test('settings file: written once, kept if identical, a conflict if edited, replaced by --update-roles', async (t) => {
  const { maestri, team, settings, log } = session(t);
  assert.equal(await team(), 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')),
    JSON.parse(fs.readFileSync(path.join(kit, 'team', 'settings', 'task-runner-limited.json'), 'utf8')));

  const old = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(settings, old, old);
  assert.equal(await team(), 0);
  assert.equal(fs.statSync(settings).mtimeMs, old.getTime(), 'identical content is left alone');

  fs.writeFileSync(settings, '{"edited":true}\n');
  const calls = maestri.mutations().length;
  assert.equal(await team(), 1);
  assert.match(log.err.join('\n'), /settings file .* exists with other content; rerun with --update-roles/);
  assert.equal(fs.readFileSync(settings, 'utf8'), '{"edited":true}\n');
  assert.equal(maestri.mutations().length, calls, 'a conflict changes nothing');

  assert.equal(await team('--update-roles'), 0);
  assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).toolPermission, 'request-review');
});

test('--roles-only writes no settings file and needs no agent CLI', async (t) => {
  const { maestri, team, home } = session(t, { tools: okTools({ onPath: (bin) => bin === 'maestri' }) });
  assert.equal(await team('--roles-only'), 0);
  assert.equal(maestri.roles.size, manifest.agents.length);
  assert.equal(fs.existsSync(path.join(home, '.vibecoding-devtools')), false);
});
