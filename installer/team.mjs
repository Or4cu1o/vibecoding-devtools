// Install the kit's Maestri team from team/team.json through the maestri CLI: roles, presets, agents, ropes, notes,
// portal and partitura. Maestri may run on another computer; this runs where the agent CLIs and `maestri` run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { missingPrerequisites, realTools } from './team-checks.mjs';

export const TEAM_HELP = `Usage: vibecoding-devtools team [--roles-only] [--update-roles] [--dry-run]
Run inside a Maestri terminal in Maestro mode, on the machine where the agent CLIs run.
--roles-only    Create the team's missing global roles only
--update-roles  Also rewrite what differs from the kit: installed roles (restarts the agents that use them), the Maestro
                preset command and the Task Runner settings file
--dry-run       Print the full maestri commands without running them
Without --roles-only it also writes the Task Runner settings file to ~/.vibecoding-devtools/team/, creates the Maestro
preset, recruits the agents, notes and portal you do not reach yet, wires them, and saves the global partitura unless
one with its name exists.
Before any change, also with --dry-run, it checks read-only that the CLIs, the models in team.json and ECC in Claude
Code exist; missing items or conflicts stop the run with exit 1. If a run fails midway, run the same command again: it
skips what exists and finishes the rest.`;

const FLAGS = ['--roles-only', '--update-roles', '--dry-run'];

// `- "Name"` entries of `maestri role|preset|partitura list`.
export const listedNames = (output) => [...output.matchAll(/^\s*- "([^"]+)"/gm)].map((m) => m[1]);

// Top-level sections of `maestri list` (what the caller reaches); nested `⎿` lines belong to other agents' trees.
export function canvasEntries(output) {
  const found = { agents: new Map(), notes: new Set(), portals: new Set(), ficharios: new Set() };
  let section = null;
  for (const line of output.split('\n')) {
    if (/^\S/.test(line)) section = /^Connected (agents|notes|portals)/.exec(line)?.[1] ?? null;
    else if (section && !line.trimStart().startsWith('⎿')) {
      const fichario = /^\s*fichário "([^"]+)":/.exec(line);
      const entry = /^\s*- name: "([^"]+)"(?:, role: "([^"]+)")?/.exec(line);
      if (fichario) found.ficharios.add(fichario[1]);
      else if (entry && section === 'agents') found.agents.set(entry[1], entry[2] ?? null);
      else if (entry) found[section].add(entry[1]);
    }
  }
  return found;
}

export const roleText = (role, protocol) => `${role.trimEnd()}\n\n${protocol.trimEnd()}`;

// `maestri preset show` prints `Command: ...` and `Maestro: on|off`.
export const presetShown = (output) => ({
  command: output.match(/^Command: (.*)$/m)?.[1]?.trim(),
  maestro: /^Maestro: on$/m.test(output),
});

// maestri decodes \n and \\ in note content; keep backslashes literal.
const noteText = (text) => text.trimEnd().replaceAll('\\', '\\\\');

// Session settings live in a stable file under the home folder, not in the kit's (npx cache) folder.
export const settingsPath = (home, file) => path.join(home, '.vibecoding-devtools', 'team', path.basename(file));

// One shell argument that POSIX shells and PowerShell read the same way.
function shellArgument(value) {
  if (/["`$]/.test(value)) throw new Error(`The path ${value} has a character the agent command cannot quote.`);
  return /^[\w./\\:@-]+$/.test(value) ? value : `"${value}"`;
}

function agentCommand(agent, home) {
  if (!agent.settingsFile) return agent.command;
  return agent.command.replace('{settings}', () => shellArgument(settingsPath(home, agent.settingsFile)));
}

// Files the team needs on the machine that runs the agents: [{ path, content }].
export const teamFiles = (manifest, read, home) => manifest.agents.filter((a) => a.settingsFile).map((a) => ({
  path: settingsPath(home, a.settingsFile),
  content: `${JSON.stringify(JSON.parse(read(a.settingsFile)), null, 2)}\n`,
}));

const presetDiffers = (found, preset) => found.command !== preset.command || found.maestro !== Boolean(preset.maestro);

const kitRoles = (manifest, read) => {
  const protocol = read(manifest.protocol);
  return manifest.agents.map(({ role, roleFile }) => ({ role, text: roleText(read(roleFile), protocol) }));
};

// Everything that would make the run touch something that is not the kit's: checked before any change.
export function teamConflicts(manifest, read, existing, options = {}) {
  const { rolesOnly = false, updateRoles = false, home = os.homedir() } = options;
  const conflicts = [];
  for (const { role, text } of kitRoles(manifest, read)) {
    if (existing.roles.has(role) && existing.roles.get(role) !== text && !updateRoles) {
      conflicts.push(`role "${role}" exists with other text; rerun with --update-roles to replace it`);
    }
  }
  if (rolesOnly) return conflicts;
  for (const preset of manifest.presets) {
    const found = existing.presets.get(preset.name);
    if (found && presetDiffers(found, preset) && !updateRoles) {
      conflicts.push(`preset "${preset.name}" exists with another command or Maestro setting; `
        + 'rerun with --update-roles to replace it');
    }
  }
  for (const { path: file, content } of teamFiles(manifest, read, home)) {
    if (existing.files.has(file) && existing.files.get(file) !== content && !updateRoles) {
      conflicts.push(`settings file ${file} exists with other content; rerun with --update-roles to replace it`);
    }
  }
  const { agents, notes, portals, ficharios } = existing.canvas;
  const kinds = { agent: agents, note: notes, portal: portals, fichário: ficharios };
  const misused = (name, kind) => Object.entries(kinds).find(([k, set]) => k !== kind && set.has(name))?.[0];
  for (const agent of manifest.agents) {
    if (agents.has(agent.name) && agents.get(agent.name) !== agent.role) {
      conflicts.push(`agent "${agent.name}" exists with role "${agents.get(agent.name)}", not "${agent.role}"`);
    }
  }
  const named = [...manifest.agents.map((a) => [a.name, 'agent']), ...manifest.notes.map((n) => [n.name, 'note']),
    ...manifest.fichario.pages.map((n) => [n.name, 'note']), [manifest.fichario.name, 'fichário'],
    ...manifest.portals.map((x) => [x.name, 'portal'])];
  for (const [name, kind] of named) {
    const other = misused(name, kind);
    if (other) conflicts.push(`${other} "${name}" you reach has a name the kit needs for its ${kind}`);
  }
  return conflicts;
}

// Pure plan: maestri argument lists, skipping what already exists.
export function teamCommands(manifest, read, existing, options = {}) {
  const { rolesOnly = false, updateRoles = false, home = os.homedir() } = options;
  const commands = [];
  for (const { role, text } of kitRoles(manifest, read)) {
    if (!existing.roles.has(role)) commands.push(['role', 'create', role, text, '--scope', 'global']);
    else if (updateRoles && existing.roles.get(role) !== text) commands.push(['role', 'write', role, text]);
  }
  if (rolesOnly) return commands;

  for (const preset of manifest.presets) {
    const found = existing.presets.get(preset.name);
    const maestro = preset.maestro ? 'on' : 'off';
    const settings = ['--command', preset.command, '--maestro', maestro];
    if (!found) commands.push(['preset', 'create', preset.name, ...settings, '--quick-start', 'off']);
    else if (updateRoles && presetDiffers(found, preset)) commands.push(['preset', 'set', preset.name, ...settings]);
  }
  for (const agent of manifest.agents.filter((a) => !existing.canvas.agents.has(a.name))) {
    const launch = agent.preset ? ['--preset', agent.preset] : ['--command', agentCommand(agent, home)];
    commands.push(['recruit', agent.name, '--role', agent.role, '--color', agent.color, '--icon', agent.icon, ...launch]);
  }
  const others = manifest.agents.map((a) => a.name).filter((n) => n !== manifest.maestro);
  for (const [a, b] of [...others.map((n) => [manifest.maestro, n]), ...manifest.peers]) commands.push(['connect', a, b]);
  for (const note of manifest.notes) {
    if (!existing.canvas.notes.has(note.name)) commands.push(['note', 'create', noteText(read(note.file)), '--name', note.name, '--color', note.color]);
    for (const agent of note.connect) commands.push(['connect', note.name, agent]);
  }
  for (const page of manifest.fichario.pages.filter((p) => !existing.canvas.notes.has(p.name))) {
    commands.push(['note', 'create', noteText(read(page.file)), '--name', page.name, '--stack', manifest.fichario.name]);
  }
  for (const agent of manifest.fichario.connect) commands.push(['connect', manifest.fichario.name, agent]);
  for (const portal of manifest.portals) {
    if (!existing.canvas.portals.has(portal.name)) commands.push(['portal', 'create', portal.url, portal.name]);
    for (const agent of portal.connect) commands.push(['connect', agent, portal.name]);
  }
  const { partitura } = manifest;
  if (!existing.partituras.has(partitura.name)) {
    commands.push(['partitura', 'create', partitura.name, ...manifest.agents.map((a) => a.name), '--without-me',
      '--scope', 'global', '--commands', 'on', '--note-text', 'on', '--chat-history', 'off',
      '--description', partitura.description, '--icon', partitura.icon, '--color', partitura.color]);
  }
  return commands;
}

// Settings files to write: the ones missing, and with --update-roles the ones that differ. Never with --roles-only.
export function teamFileWrites(manifest, read, existing, options = {}) {
  const { rolesOnly = false, updateRoles = false, home = os.homedir() } = options;
  if (rolesOnly) return [];
  return teamFiles(manifest, read, home).filter(({ path: file, content }) => !existing.files.has(file)
    || (updateRoles && existing.files.get(file) !== content));
}

const quoted = (a) => (/^[\w./#@:-]+$/.test(a) ? a : JSON.stringify(a));
const shown = (args, full) => `maestri ${args.map((a) => quoted(full || a.length <= 60 ? a : `${a.slice(0, 57)}...`)).join(' ')}`;

const readIfExists = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw e;
  }
};

const writeTeamFile = ({ path: file, content }) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

// Everything read-only: prerequisites, then what Maestri and the home folder hold now. Throws before any change.
function planInstall({ manifest, read, run, bin, home, tools, options }) {
  const missing = missingPrerequisites(manifest, tools, { maestri: bin, rolesOnly: options.rolesOnly });
  if (missing.length) throw new Error(`Nothing changed. Missing prerequisites:\n- ${missing.join('\n- ')}`);
  const list = run(bin, ['list']);
  if (!/maestro: true/.test(list.split('\n\n')[0])) throw new Error('Run this from a Maestri terminal in Maestro mode.');
  const roleNames = new Set(listedNames(run(bin, ['role', 'list'])));
  const presetNames = new Set(listedNames(run(bin, ['preset', 'list'])));
  const files = teamFiles(manifest, read, home).map((f) => [f.path, readIfExists(f.path)])
    .filter(([, text]) => text !== undefined);
  const existing = {
    roles: new Map(manifest.agents.filter((a) => roleNames.has(a.role))
      .map((a) => [a.role, run(bin, ['role', 'show', a.role]).replace(/^Role: [^\n]*\n\n/, '').trimEnd()])),
    presets: new Map(manifest.presets.filter((p) => presetNames.has(p.name))
      .map((p) => [p.name, presetShown(run(bin, ['preset', 'show', p.name]))])),
    files: new Map(files),
    canvas: canvasEntries(list),
    partituras: new Set(listedNames(run(bin, ['partitura', 'list']))),
  };
  const conflicts = teamConflicts(manifest, read, existing, options);
  if (conflicts.length) throw new Error(`Nothing changed. Conflicts:\n- ${conflicts.join('\n- ')}`);
  return [
    ...teamFileWrites(manifest, read, existing, options).map((file) => {
      const text = `${existing.files.has(file.path) ? 'replace' : 'write'} ${file.path}`;
      return { full: text, brief: text, go: () => writeTeamFile(file) };
    }),
    ...teamCommands(manifest, read, existing, options)
      .map((args) => ({ full: shown(args, true), brief: shown(args, false), go: () => run(bin, args) })),
  ];
}

export async function teamMain(argv, { kit = fileURLToPath(new URL('../', import.meta.url)), out = console.log,
  err = console.error, env = process.env, home = os.homedir(), tools = realTools({ env }),
  run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) } = {}) {
  if (argv.includes('--help')) { out(TEAM_HELP); return 0; }
  const unknown = argv.filter((a) => !FLAGS.includes(a));
  if (unknown.length) { err(`Unknown argument: ${unknown[0]}\n${TEAM_HELP}`); return 2; }
  const options = { rolesOnly: argv.includes('--roles-only'), updateRoles: argv.includes('--update-roles'), home };
  const dryRun = argv.includes('--dry-run');
  const dir = path.join(kit, 'team');
  const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8');
  const bin = env.MAESTRI_CLI || 'maestri';
  let steps;
  try {
    steps = planInstall({ manifest: JSON.parse(read('team.json')), read, run, bin, home, tools, options });
  } catch (e) {
    err(e.stderr?.toString().trim() || e.message);
    return 1;
  }
  out('Prerequisites found.');
  if (!steps.length) out('The team is already installed as the kit defines it.');
  for (const [index, step] of steps.entries()) {
    out(dryRun ? step.full : step.brief);
    if (dryRun) continue;
    try {
      step.go();
    } catch (e) {
      err(e.stderr?.toString().trim() || e.message);
      err(`Stopped at step ${index + 1} of ${steps.length} (${index} done). Run the same command again to resume: `
        + 'it skips what exists and finishes the rest.');
      return 1;
    }
  }
  if (!options.rolesOnly && !dryRun) {
    out('Next: answer each new agent\'s startup prompts as the maestri-agent-cli skill describes, sign in to Gemini '
      + 'in the portal, and run the check in team/README.md (Check section).');
  }
  return 0;
}
