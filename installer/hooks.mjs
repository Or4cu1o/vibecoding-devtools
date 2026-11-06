import path from 'node:path';
import fs from 'node:fs';
import { readState } from './state.mjs';

export const CODEX_HOOK_APPROVAL = 'Codex hooks must be approved in /hooks; approve them again after changes.';

export function hookActions(choices, { home, kit, project }) {
  if (choices.hooks === false || !choices.clis?.length) return [];
  const local = choices.scope === 'project';
  if (local && !project) throw new Error('Project hooks require paths.project');
  const root = local ? project : home;
  const directory = path.join(root, '.vibecoding-devtools', 'hooks');
  const names = ['secret-scan', 'full-suite', ...(choices.maestri ? ['maestri-protocol'] : [])];
  const scriptPaths = ['secret-scan', 'full-suite', 'maestri-protocol']
    .map((name) => path.join(directory, `${name}.mjs`));
  const actions = ['', 'lib'].flatMap((subdirectory) => fs.readdirSync(path.join(kit, 'hooks', subdirectory),
    { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ type: 'copy', owner: 'kit', cli: choices.clis[0],
      source: path.join(kit, 'hooks', subdirectory, entry.name),
      destination: path.join(directory, subdirectory, entry.name), content: null,
      description: `Kit hook script: ${path.join(subdirectory, entry.name)}` })));
  for (const cli of [...new Set(choices.clis)].sort()) {
    const destination = cli === 'claude' ? path.join(root, '.claude', 'settings.json')
      : cli === 'codex' ? path.join(root, '.codex', 'hooks.json')
        : local ? path.join(project, '.agents', 'hooks.json') : path.join(home, '.gemini', 'config', 'hooks.json');
    const scriptReferences = [];
    const groups = names.map((name) => {
      const script = path.join(directory, `${name}.mjs`);
      const portable = `.vibecoding-devtools/hooks/${name}.mjs`;
      const relative = path.relative(path.dirname(destination), script).replace(/\\/g, '/');
      if (cli === 'agy' && (/\s/.test(relative) || path.isAbsolute(relative))) {
        throw new Error('Cannot register Antigravity hook: relative script path must have no spaces'
          + ' and stay on the same drive');
      }
      let command = cli === 'agy' ? `node ${relative}` : `node "${script.replace(/\\/g, '/')}"`;
      if (local && cli === 'claude') {
        const reference = '${CLAUDE_PROJECT_DIR}/' + portable;
        scriptReferences.push(reference);
        command = `node "${reference}"`;
      } else if (local && cli === 'codex') {
        scriptReferences.push(portable);
        // Codex starts hooks in the session cwd, including repository subfolders.
        // A Node launcher works in both POSIX shells and Windows commandWindows.
        const launcher = "const c=require('node:child_process');const p=require('node:path');"
          + "const root=c.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();"
          + `const r=c.spawnSync(process.execPath,[p.join(root,'${portable}')],{stdio:'inherit'});`
          + 'process.exit(r.status??1)';
        command = `node -e "${launcher}"`;
      }
      return { matcher: cli === 'agy' ? 'run_command' : cli === 'claude' ? 'Bash|PowerShell' : 'Bash',
        hooks: [{ type: 'command', command, ...(cli === 'codex' ? { commandWindows: command } : {}), timeout: 30 }] };
    });
    // The T-51 project Antigravity file can still point to the old home runtime.
    // Recognize those tracked paths so the normal hash check can migrate it.
    const previous = local ? readState({ home }).items.find((item) => item.owner === 'kit'
      && item.type === 'json-merge' && item.destination === destination) : undefined;
    actions.push({ type: 'json-merge', owner: 'kit', cli, destination, format: cli,
      scriptPaths: [...new Set([...scriptPaths, ...(previous?.scriptPaths ?? [])])],
      scriptReferences: [...new Set([...scriptReferences, ...(previous?.scriptReferences ?? [])])],
      entries: cli === 'agy' ? Object.fromEntries(names.map((name, i) =>
        [`vibecoding-${name}`, { enabled: true, PreToolUse: [groups[i]] }])) : groups,
      description: `Kit hooks for ${cli}` });
  }
  return actions;
}
