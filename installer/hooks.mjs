import path from 'node:path';
import fs from 'node:fs';

export const CODEX_HOOK_APPROVAL = 'Codex hooks must be approved in /hooks; approve them again after changes.';

export function hookActions(choices, { home, kit }) {
  if (choices.hooks === false || !choices.clis?.length) return [];
  const directory = path.join(home, '.vibecoding-devtools', 'hooks');
  const names = ['secret-scan', ...(choices.maestri ? ['maestri-protocol'] : [])];
  const scriptPaths = ['secret-scan', 'maestri-protocol'].map((name) => path.join(directory, `${name}.mjs`));
  const actions = ['', 'lib'].flatMap((subdirectory) => fs.readdirSync(path.join(kit, 'hooks', subdirectory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ type: 'copy', owner: 'kit', cli: choices.clis[0],
      source: path.join(kit, 'hooks', subdirectory, entry.name),
      destination: path.join(directory, subdirectory, entry.name), content: null,
      description: `Kit hook script: ${path.join(subdirectory, entry.name)}` })));
  for (const cli of [...new Set(choices.clis)].sort()) {
    const groups = names.map((name) => {
      const command = `node "${path.join(directory, `${name}.mjs`).replace(/\\/g, '/')}"`;
      return { matcher: cli === 'agy' ? 'run_command' : cli === 'claude' ? 'Bash|PowerShell' : 'Bash',
        hooks: [{ type: 'command', command, ...(cli === 'codex' ? { commandWindows: command } : {}), timeout: 30 }] };
    });
    const destination = cli === 'claude' ? path.join(home, '.claude', 'settings.json')
      : cli === 'codex' ? path.join(home, '.codex', 'hooks.json') : path.join(home, '.gemini', 'config', 'hooks.json');
    actions.push({ type: 'json-merge', owner: 'kit', cli, destination, format: cli, scriptPaths,
      entries: cli === 'agy' ? Object.fromEntries(names.map((name, i) =>
        [`vibecoding-${name}`, { enabled: true, PreToolUse: [groups[i]] }])) : groups,
      description: `Kit hooks for ${cli}` });
  }
  return actions;
}
