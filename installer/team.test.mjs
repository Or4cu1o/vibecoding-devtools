import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canvasEntries, listedNames, presetShown, roleText, settingsPath, teamCommands, teamConflicts, teamFileWrites, teamFiles,
} from './team.mjs';

const teamDir = fileURLToPath(new URL('../team/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(teamDir, 'team.json'), 'utf8'));
const read = (file) => fs.readFileSync(path.join(teamDir, file), 'utf8');
const emptyCanvas = () => ({ agents: new Map(), notes: new Set(), portals: new Set(), ficharios: new Set() });
const home = path.join(path.sep, 'home', 'someone');
const none = () => ({ roles: new Map(), presets: new Map(), files: new Map(), canvas: emptyCanvas(), partituras: new Set() });
const has = (commands, ...args) => commands.some((c) => args.every((a, i) => c[i] === a));
const kitText = (role) => {
  const agent = manifest.agents.find((a) => a.role === role);
  return roleText(read(agent.roleFile), read(manifest.protocol));
};

test('role text is the role file, one blank line and the team protocol', () => {
  assert.equal(roleText('# Role\n\nBody\n\n', '## Team protocol\n- rule\n'), '# Role\n\nBody\n\n## Team protocol\n- rule');
});

test('listings: role names, and only the top-level sections of maestri list, by kind', () => {
  assert.deepEqual(listedNames('  - "Team Maestro" — You are…\n  - "vibecoding-devtools" (global)'), ['Team Maestro', 'vibecoding-devtools']);
  const list = 'You:\n  - name: "Me", role: "X", maestro: true\n\nConnected agents:\n  - name: "Vitral", role: "Frontend Engineer"\n'
    + '    ⎿ agent: "Bússola"\n    ⎿ note: "Decisions"\n\nConnected portals (use x):\n  - name: "Gemini" - url: https://g\n\n'
    + 'Connected notes (use y):\n  fichário "Project Context":\n    - name: "Requirements"\n  - name: "Team Roster"';
  const found = canvasEntries(list);
  assert.deepEqual([...found.agents], [['Vitral', 'Frontend Engineer']]);
  assert.deepEqual([[...found.notes], [...found.portals], [...found.ficharios]], [['Requirements', 'Team Roster'], ['Gemini'], ['Project Context']]);
  assert.deepEqual(presetShown('Preset: P\nCommand: claude --x\nMaestro: on\n'), { command: 'claude --x', maestro: true });
});

test('roles: identical ones are left alone, different ones conflict unless --update-roles', () => {
  const existing = { ...none(), roles: new Map([['Team Maestro', kitText('Team Maestro')], ['Task Runner', 'other']]) };
  assert.deepEqual(teamConflicts(manifest, read, existing), [
    'role "Task Runner" exists with other text; rerun with --update-roles to replace it']);
  assert.deepEqual(teamConflicts(manifest, read, existing, { updateRoles: true }), []);
  const plain = teamCommands(manifest, read, existing, { rolesOnly: true });
  assert.equal(has(plain, 'role', 'write'), false);
  assert.equal(plain.filter((c) => c[1] === 'create').length, manifest.agents.length - 2);
  assert.ok(has(teamCommands(manifest, read, existing, { rolesOnly: true, updateRoles: true }), 'role', 'write', 'Task Runner'));
});

test('presets and agents that exist with other settings are conflicts', () => {
  const canvas = { ...emptyCanvas(), agents: new Map([['Vitral', 'Code Reviewer']]), notes: new Set(['Forja']) };
  const existing = { ...none(), presets: new Map([['Team Maestro', { command: 'claude', maestro: true }]]), canvas };
  assert.equal(teamConflicts(manifest, read, existing).length, 3);
  assert.ok(teamConflicts(manifest, read, existing).includes('note "Forja" you reach has a name the kit needs for its agent'));
});

test('full install creates the preset in one command, skips what exists and wires the maestro to everyone', () => {
  const canvas = { ...emptyCanvas(), agents: new Map([['Vitral', 'Frontend Engineer']]), notes: new Set(['Decisions']),
    portals: new Set(['Gemini']) };
  const existing = { ...none(), canvas, partituras: new Set(['vibecoding-devtools']) };
  const commands = teamCommands(manifest, read, existing, { home });
  assert.ok(has(commands, 'preset', 'create', 'Team Maestro', '--command', manifest.presets[0].command, '--maestro', 'on'));
  assert.equal(has(commands, 'preset', 'set'), false);
  assert.equal(has(commands, 'recruit', 'Vitral') || has(commands, 'partitura') || has(commands, 'portal', 'create'), false);
  assert.equal(commands.some((c) => c[0] === 'note' && c.includes('Decisions')), false);
  const formiga = commands.find((c) => c[0] === 'recruit' && c[1] === 'Formiga');
  const file = path.join(home, '.vibecoding-devtools', 'team', 'task-runner-limited.json');
  assert.ok(formiga[formiga.indexOf('--command') + 1].endsWith(` --settings ${file}`));
  for (const agent of manifest.agents.filter((a) => a.name !== manifest.maestro)) {
    assert.ok(has(commands, 'connect', manifest.maestro, agent.name), agent.name);
  }
});

test('the settings path is under the home folder, quoted when it has spaces, never in the kit folder', () => {
  const spaced = path.join(path.sep, 'home', 'some one');
  const [recruit] = teamCommands(manifest, read, none(), { home: spaced }).filter((c) => c[1] === 'Formiga');
  assert.ok(recruit.at(-1).endsWith(` --settings "${settingsPath(spaced, 'settings/task-runner-limited.json')}"`));
  assert.equal(recruit.at(-1).includes(teamDir), false);
  assert.throws(() => teamCommands(manifest, read, none(), { home: '/home/$x' }), /cannot quote/);
});

test('settings file: written when missing, left alone when identical, a conflict when different unless --update-roles', () => {
  const [file] = teamFiles(manifest, read, home);
  assert.deepEqual(JSON.parse(file.content), JSON.parse(read('settings/task-runner-limited.json')));
  const state = (text) => ({ ...none(), files: new Map(text === undefined ? [] : [[file.path, text]]) });
  assert.deepEqual(teamFileWrites(manifest, read, state(), { home }), [file]);
  assert.deepEqual(teamFileWrites(manifest, read, state(file.content), { home }), []);
  assert.deepEqual(teamConflicts(manifest, read, state(file.content), { home }), []);
  assert.deepEqual(teamConflicts(manifest, read, state('{}'), { home }), [
    `settings file ${file.path} exists with other content; rerun with --update-roles to replace it`]);
  assert.deepEqual(teamFileWrites(manifest, read, state('{}'), { home }), []);
  assert.deepEqual(teamConflicts(manifest, read, state('{}'), { home, updateRoles: true }), []);
  assert.deepEqual(teamFileWrites(manifest, read, state('{}'), { home, updateRoles: true }), [file]);
  assert.deepEqual(teamFileWrites(manifest, read, state(), { home, rolesOnly: true }), []);
});

test('a preset with another command conflicts, and --update-roles replaces it with preset set', () => {
  const [preset] = manifest.presets;
  const old = { ...none(), presets: new Map([[preset.name, { command: preset.command.replace(' --add-dir ../../..', ''), maestro: true }]]) };
  assert.equal(teamConflicts(manifest, read, old, { home }).length, 1);
  assert.deepEqual(teamConflicts(manifest, read, old, { home, rolesOnly: true }), []);
  assert.deepEqual(teamConflicts(manifest, read, old, { home, updateRoles: true }), []);
  const commands = teamCommands(manifest, read, old, { home, updateRoles: true });
  assert.ok(has(commands, 'preset', 'set', preset.name, '--command', preset.command, '--maestro', 'on'));
  assert.equal(has(commands, 'preset', 'create'), false);
  assert.equal(has(teamCommands(manifest, read, old, { home }), 'preset'), false);
});

test('every Claude command reaches the workspace root, and --add-dir does not swallow the next flag', () => {
  const commands = [...manifest.presets, ...manifest.agents].map((x) => x.command).filter((c) => c?.startsWith('claude '));
  assert.ok(commands.length > 1);
  for (const command of commands) assert.match(command, / --add-dir \.\.\/\.\.\/\.\.(?: --\w|$)/, command);
});

test('the team preset has its own name; the kit never touches a generic Maestro preset', () => {
  assert.deepEqual(manifest.presets.map((p) => p.name), ['Team Maestro']);
  assert.equal(manifest.presets[0].maestro, true);
  assert.match(manifest.presets[0].command, / --add-dir \.\.\/\.\.\/\.\.$/);
  const generic = { ...none(), presets: new Map([['Maestro Opus High', { command: 'claude', maestro: true }]]) };
  assert.deepEqual(teamConflicts(manifest, read, generic, { home }), []);
  assert.equal(teamCommands(manifest, read, generic, { home, updateRoles: true })
    .some((c) => c.includes('Maestro Opus High')), false);
});

test('manifest references existing files and known agents', () => {
  const names = new Set(manifest.agents.map((a) => a.name));
  for (const agent of manifest.agents) {
    assert.ok(fs.existsSync(path.join(teamDir, agent.roleFile)), agent.roleFile);
    assert.ok(Boolean(agent.preset) !== Boolean(agent.command), agent.name);
    if (agent.settingsFile) JSON.parse(read(agent.settingsFile));
  }
  const endpoints = [...manifest.peers.flat(), ...manifest.notes.flatMap((n) => n.connect),
    ...manifest.fichario.connect, ...manifest.portals.flatMap((p) => p.connect)];
  for (const name of endpoints) assert.ok(names.has(name), name);
  for (const page of [...manifest.fichario.pages, ...manifest.notes]) assert.ok(fs.existsSync(path.join(teamDir, page.file)));
});
