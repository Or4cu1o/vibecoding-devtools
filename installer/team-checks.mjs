// Read-only prerequisites of the team install: the CLIs, the models the launch commands name, and ECC in Claude Code.
// Everything that touches the machine goes through `tools`, so tests inject fakes instead of running real CLIs.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { findIn, pathDirectories } from './detect.mjs';

const binaryOf = (command) => command.trim().split(/\s+/)[0];
const modelOf = (command) => command.match(/(?:^|\s)(?:--model|-m)[ =](\S+)/)?.[1];

// The commands the install launches: presets, and agents that carry their own command instead of a preset.
const launchCommands = (manifest) => [
  ...manifest.presets.map((p) => ({ label: `preset "${p.name}"`, command: p.command })),
  ...manifest.agents.filter((a) => a.command).map((a) => ({ label: `agent "${a.name}"`, command: a.command })),
];

// Model ids a CLI lists: `codex debug models` prints JSON with `slug`; `agy models` prints `<id>\t<name>` lines.
const MODEL_LISTS = {
  codex: { source: 'codex debug models', read: (tools) => JSON.parse(tools.codexModels()).models.map((m) => m.slug) },
  agy: { source: 'agy models', read: (tools) => tools.agyModels().split('\n').filter((l) => l.includes('\t'))
    .map((l) => l.split(/\s+/)[0]) },
};

const attempt = (what, fn) => {
  try {
    return { value: fn() };
  } catch (e) {
    return { problem: `could not run ${what}: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}` };
  }
};

// Missing items, all together; an empty list means the run may start. `rolesOnly` creates roles and launches nothing,
// so it needs only the maestri binary.
export function missingPrerequisites(manifest, tools, { maestri = 'maestri', rolesOnly = false } = {}) {
  const launches = rolesOnly ? [] : launchCommands(manifest);
  const bins = [...new Set([maestri, ...launches.map((l) => binaryOf(l.command))])];
  const absent = new Set(bins.filter((bin) => !tools.onPath(bin)));
  const problems = [...absent].map((bin) => `${bin} is not on PATH`);

  const catalogs = new Map();
  for (const { label, command } of launches) {
    const bin = binaryOf(command);
    const model = modelOf(command);
    if (absent.has(bin) || !model || !MODEL_LISTS[bin]) continue;
    if (!catalogs.has(bin)) {
      const { source, read } = MODEL_LISTS[bin];
      catalogs.set(bin, attempt(source, () => new Set(read(tools))));
    }
    const { value, problem } = catalogs.get(bin);
    if (problem) {
      if (!problems.includes(problem)) problems.push(problem);
    } else if (!value.has(model)) {
      problems.push(`${label}: model "${model}" is not in ${MODEL_LISTS[bin].source}`);
    }
  }

  if (bins.includes('claude') && !absent.has('claude')) {
    const { value, problem } = attempt('claude plugin list', () => tools.claudePlugins());
    if (problem) problems.push(problem);
    else if (!/\becc@/.test(value)) {
      problems.push('ECC is not installed in Claude Code (claude plugin list shows no ecc@): '
        + 'the Team Maestro role uses /ecc:plan');
    }
  }
  return problems;
}

// A path as given, or a name found on PATH (PATHEXT on Windows).
function onPath(bin, env, platform) {
  if (/[\\/]/.test(bin)) return fs.existsSync(bin);
  try {
    return Boolean(findIn(bin, pathDirectories(env), { env, platform }));
  } catch {
    return false;
  }
}

const BIG_OUTPUT = 64 * 1024 * 1024;
const runCli = (bin, args) => execFileSync(bin, args,
  { encoding: 'utf8', maxBuffer: BIG_OUTPUT, stdio: ['ignore', 'pipe', 'pipe'] });

export const realTools = ({ env = process.env, platform = process.platform } = {}) => ({
  onPath: (bin) => onPath(bin, env, platform),
  codexModels: () => runCli('codex', ['debug', 'models']),
  agyModels: () => runCli('agy', ['models']),
  claudePlugins: () => runCli('claude', ['plugin', 'list']),
});
