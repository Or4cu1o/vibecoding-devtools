#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectAll } from './detect.mjs';
import { buildPlan, reconcileUpdate } from './plan.mjs';
import { execute, uninstall, START, END } from './execute.mjs';
import { readState, hashContent } from './state.mjs';
import { parseFlags, choicesFromFlags, panel, confirmExecution, Cancellation } from './panel.mjs';
import * as thirdPartyApi from './third-party.mjs';
import { jsonMergeSituation } from './json-merge.mjs';
import { CODEX_HOOK_APPROVAL } from './hooks.mjs';

export const HELP = `Usage: vibecoding-devtools [install|update|detect|uninstall] [flags]
Default command: install. Without a TTY: use --yes to apply or --dry-run to preview.
Update reuses saved install choices; explicit flags override them. Run install first if no choices are saved.
Update removes unchanged kit-owned items absent from the new plan; edited and third-party items are retained.
--clis claude,codex,agy        Kit CLIs (default: detected; empty or none: no CLIs)
--scope global|project       Global by default; project requires a git repository
--project                    Shortcut for --scope project
--maestri / --no-maestri     Include or disable Maestri rules and skills
--hooks / --no-hooks         Install kit hooks (default: enabled; Maestri hook requires --maestri)
--ecc claude,codex            ECC CLIs (default: none)
--ecc-hooks / --no-ecc-hooks  Enable or disable ECC hooks (default: disabled)
--ecc-stacks typescript,python  Project ECC packages (default: detected stacks)
--impeccable claude,codex,agy  Impeccable CLIs (default: none)
--impeccable-hooks / --no-impeccable-hooks  Enable or disable Impeccable hooks (default: disabled)
--dry-run  --yes  --force  --json  --help
Without a cache, ECC rules are summarized without downloading; ECC is fetched only after confirmation.
Exit codes: 0 success; 1 something was skipped, blocked or failed; 2 usage error.`;

export function formatDetection(r) {
  const tool = (name, f, url) => f.ok ? `${name} ${f.version ?? '?'} ok` : `${name}: ${f.error}. To install: ${url}`;
  const lines = [r.node.ok ? `Node ${r.node.version} ok` : `Node ${r.node.version}: requires ${r.node.minimum} or later. To install: https://nodejs.org`,
    tool('git', r.git, 'https://git-scm.com/downloads'), tool('gitleaks', r.gitleaks, 'https://github.com/gitleaks/gitleaks#installing')];
  for (const c of r.clis) {
    if (c.state === 'missing') lines.push(`${c.name}: not installed. To install: ${c.install}`);
    else if (c.state === 'error') lines.push(`${c.name}: found at ${c.filePath}, but did not respond: ${c.error}`);
    else if (c.state === 'off-path') lines.push(`${c.name} ${c.version ?? '?'}: installed in ${c.directory}, outside PATH. Add this directory to PATH.`);
    else lines.push(`${c.name} ${c.version ?? '?'}: ${c.filePath}`);
  }
  lines.push(r.project.inRepository ? `Project: ${r.project.root}\nStacks: ${(r.project.stacks ?? []).join(', ') || 'none recognized'}` : `Project: ${r.project.reason}. Only global scope is available.`);
  return lines.join('\n');
}

// Read-only: execution validates paths and expands directories into individual files.
export function summarizePlan(plan, { home, force = false } = {}) {
  // Planning already recognizes AGENTS templates with blocks and identical external installations.
  // Only list identical items: the executor protects files that are not registered.
  const identical = [];
  const listSame = (action) => {
    if (action.type === 'copy' && fs.lstatSync(action.source).isDirectory()) {
      identical.push({ ...action, directory: true });
      for (const name of fs.readdirSync(action.source).sort()) listSame({ ...action, source: path.join(action.source, name), destination: path.join(action.destination, name) });
    } else identical.push(action);
  };
  for (const action of plan.filter((a) => a.type !== 'summary' && a.situation === 'same')) listSame(action);
  // Force allows file replacement; conflicting third-party commands remain blocked.
  const conflicts = plan.filter((a) => a.situation === 'conflict' && (!force || a.type === 'command'));
  const deferred = plan.filter((a) => a.type === 'summary');
  const preview = execute(plan.filter((a) => a.type !== 'summary' && a.situation !== 'same' && (a.situation !== 'conflict' || (force && a.type !== 'command'))), { home, dryRun: true, force });
  const state = readState({ home });
  const actions = preview.actions.map((action) => {
    if (action.situation === 'remove') return action;
    if (action.status === 'same') return { ...action, situation: 'same' };
    if (action.type === 'command') {
      const same = state.items.some((i) => i.type === 'command' && i.cmd === action.cmd && JSON.stringify(i.args) === JSON.stringify(action.args) && i.cwd === (action.cwd ?? home) && i.cli === action.cli && i.owner === action.owner && JSON.stringify(i.env) === JSON.stringify(action.env));
      return { ...action, situation: action.situation === 'update' ? 'update' : same ? 'same' : action.situation ?? 'new' };
    }
    const st = fs.existsSync(action.destination) ? fs.lstatSync(action.destination) : null;
    if (st?.isDirectory()) return { ...action, situation: 'same', directory: true };
    if (action.type === 'copy' && fs.lstatSync(action.source).isDirectory()) return { ...action, situation: 'new', directory: true };
    let current = st ? fs.readFileSync(action.destination) : null;
    if (action.type === 'json-merge') {
      const previous = state.items.find((i) => i.type === action.type && i.destination === action.destination);
      return { ...action, situation: jsonMergeSituation(current, action, previous) };
    }
    let desired;
    if (action.type === 'block') {
      const text = current?.toString('utf8') ?? '';
      const start = text.indexOf(START);
      const end = text.indexOf(END, start);
      current = start < 0 ? null : text.slice(start, end + END.length);
      desired = `${START}\n${action.content}\n${END}`;
    } else desired = action.type === 'copy' ? fs.readFileSync(action.source) : action.content;
    const registered = state.items.some((i) => i.destination === action.destination && i.type === action.type);
    return { ...action, situation: current === null ? 'new' : registered && hashContent(current) === hashContent(desired) ? 'same' : 'update' };
  });
  actions.push(...identical, ...deferred);
  for (const conflict of [...conflicts, ...preview.conflicts]) actions.push({ ...conflict, situation: 'conflict' });
  return { actions, errors: preview.errors, ok: preview.errors.length === 0, warnings: [...(plan.warnings ?? []), ...preview.warnings] };
}

// Read-only: ECC fetching and validation wait until after confirmation.
export function prepareThirdParty(choices, detection, paths, { thirdParty = thirdPartyApi } = {}) {
  const installed = thirdParty.detectThirdParty(paths.home, paths.project);
  const actions = thirdParty.thirdPartyActions(choices, { ...detection, thirdParty: installed }, paths);
  // Corrupt install-state never authorizes changes to commands or rules for that CLI.
  const eccClis = choices.ecc.clis.filter((cli) => !actions.some((a) => a.owner === 'ecc' && a.cli === cli && a.situation === 'conflict'));
  const cache = path.join(paths.home, '.vibecoding-devtools', 'cache');
  const ecc = paths.ecc ?? path.join(cache, `ecc-${thirdPartyApi.thirdParty.ecc.version}`);
  const available = fs.existsSync(path.join(ecc, 'rules'));
  return { actions, warnings: [...new Set([...(installed.warnings ?? []), ...(actions.warnings ?? [])])],
    paths: available ? { ecc } : {}, cache, fetchLater: eccClis.length > 0,
    pendingRules: eccClis.length > 0 && !available,
    choices: { ...choices, ecc: { ...choices.ecc, clis: eccClis } } };
}

export async function planInstallation(choices, detection, paths, { prepareThirdParty: prepare, planBuilder = buildPlan, thirdParty = thirdPartyApi } = {}) {
  const prepared = prepare ? await prepare(choices, detection, paths) : prepareThirdParty(choices, detection, paths, { thirdParty });
  let selection = prepared.choices ?? choices;
  if (prepared.pendingRules) selection = { ...selection, ecc: { ...selection.ecc, clis: [] } };
  const kitPlan = planBuilder(selection, detection, { ...paths, ...prepared.paths });
  const plan = [...prepared.actions, ...kitPlan];
  if (prepared.pendingRules) {
    plan.push({ type: 'summary', owner: 'ecc', cli: prepared.choices.ecc.clis.join(','), situation: 'new',
      description: `Download ECC v${thirdPartyApi.thirdParty.ecc.version} and copy rules to selected CLIs (files available after download)` });
  }
  plan.warnings = [...new Set([...(prepared.warnings ?? []), ...(prepared.actions.warnings ?? []), ...(kitPlan.warnings ?? [])])];
  plan.preparation = prepared;
  return plan;
}

const formatAction = (a) => a.type === 'command' ? JSON.stringify([a.cmd, ...a.args]) : a.destination ?? a.description;
const uniqueWarnings = (warnings) => {
  const unique = new Map();
  for (const warning of warnings) {
    const destination = typeof warning === 'object' ? warning.item?.destination ?? warning.destination : undefined;
    const key = (typeof warning === 'string' ? warning : warning.reason ?? JSON.stringify(warning))
      + (destination ? `\n${destination}` : '');
    // Preserve item details when the same warning also appears as plan text.
    if (!unique.has(key) || typeof unique.get(key) === 'string') unique.set(key, warning);
  }
  return [...unique.values()];
};
const printSummary = (summary, out) => {
  out('Summary:');
  for (const a of summary.actions) out(`[${a.situation ?? a.status}] ${a.type} ${formatAction(a)}${a.reason ? ` — ${a.reason}` : ''}`);
  for (const e of summary.errors) out(`Error: ${e.message}`);
  for (const a of summary.warnings ?? []) out(`Warning: ${warningText(a)}`);
};
const warningText = (warning) => `${warning.reason ?? warning}${warning.item?.destination ? ` (${warning.item.destination})` : ''}`;

// Return an exit code; injected dependencies support noninteractive tests with fake homes.
export async function main(argv = process.argv.slice(2), options = {}) {
  const { home = os.homedir(), cwd = process.cwd(), kit = fileURLToPath(new URL('../', import.meta.url)),
    isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY), out = console.log, err = console.error,
    detect = detectAll, choose = panel, confirm = confirmExecution, prepareThirdParty: prepare, thirdParty = thirdPartyApi,
    planBuilder = buildPlan, apply = execute, remove = uninstall } = options;
  let flags;
  let warnings = [];
  let errorCode = 2;
  const emit = (object) => out(JSON.stringify(object, null, 2));
  try {
    flags = parseFlags(argv);
    if (flags.help) { out(HELP); return 0; }
    errorCode = 1;
    if (flags.command === 'uninstall') {
      const directories = new Set();
      for (const item of readState({ home }).items) if (item.destination) {
        for (let p = path.dirname(item.destination); p !== path.dirname(p) && p !== path.resolve(home); p = path.dirname(p)) {
          if (path.relative(home, p).startsWith('..')) break;
          directories.add(p);
        }
      }
      const preview = remove({ home, dryRun: true });
      if (!flags.json) printSummary(preview, out);
      if (flags['dry-run'] || !preview.ok) { if (flags.json) emit(preview); return preview.ok ? 0 : 1; }
      if (!flags.yes) {
        if (!isTTY || flags.json) throw new Error('Use --yes to uninstall without interaction or --dry-run to preview');
        if (!await confirm()) throw new Cancellation();
      }
      const result = remove({ home, dryRun: false });
      const metadata = path.join(home, '.vibecoding-devtools');
      if (fs.existsSync(metadata)) result.warnings.push({ destination: metadata, reason: `Installation metadata and cache retained at ${metadata}` });
      for (const directory of directories) if (fs.existsSync(directory) && fs.lstatSync(directory).isDirectory() && fs.readdirSync(directory).length === 0) {
        result.warnings.push({ destination: directory, reason: `Empty directory retained: ${directory}` });
      }
      if (flags.json) emit(result);
      else printSummary(result, out);
      return result.ok ? 0 : 1;
    }
    const saved = flags.command === 'update' ? readState({ home }).choices : undefined;
    if (flags.command === 'update' && !saved) throw new Error('No saved installation choices. Run install first to record your choices, then run update.');
    const reuseProject = saved?.scope === 'project' && !flags.project && flags.scope === undefined;
    const detectionCwd = reuseProject ? saved.root : cwd;
    if (reuseProject && (!saved.root || !path.isAbsolute(saved.root))) throw new Error('Invalid saved project root. Run install to record your choices again.');
    const detection = await detect({ cwd: detectionCwd, home, env: { ...process.env, HOME: home, USERPROFILE: home } });
    if (flags.command === 'detect') {
      if (flags.json) emit(detection); else out(formatDetection(detection));
      return detection.node.ok && detection.git.ok ? 0 : 1;
    }
    if (!flags.json) out(formatDetection(detection));
    if (!detection.node.ok || !detection.git.ok) throw new Error(`Missing prerequisites: ${!detection.node.ok ? 'Node >=22 (https://nodejs.org) ' : ''}${!detection.git.ok ? 'git (https://git-scm.com/downloads)' : ''}`);
    if (!isTTY && !flags.yes && !flags['dry-run']) throw new Error('Without a TTY: use --yes to apply or --dry-run to preview');
    const choices = !saved && isTTY && !flags.hasChoices && !flags.yes && !flags['dry-run'] && !flags.json ? await choose(detection) : choicesFromFlags(flags, detection, saved);
    if (reuseProject && choices.root !== saved.root) throw new Error('Saved project root is no longer a git repository. Run install again or override --scope.');
    if (!choices.clis.length && !choices.ecc.clis.length && !choices.impeccable.clis.length) throw new Error('No CLI selected; use --clis claude,codex,agy');
    // detectAll includes state, matching skills and plugins; preserve its detector contract.
    detection.installed ??= { state: readState({ home }), skills: [], plugins: {} };
    const paths = { home, kit, project: choices.root ?? detection.project.root };
    const preparePlan = async () => {
      const planned = await planInstallation(choices, detection, paths, { prepareThirdParty: prepare, planBuilder, thirdParty });
      return flags.command === 'update' ? reconcileUpdate(planned, { home }) : planned;
    };
    let plan = await preparePlan();
    let summary = summarizePlan(plan, { home, force: flags.force });
    warnings = [...summary.warnings, ...(!detection.gitleaks.ok ? ['gitleaks is recommended but missing or unavailable; install: https://github.com/gitleaks/gitleaks#installing'] : [])];
    if (!flags.json) printSummary(summary, out);
    if (flags['dry-run'] || !summary.ok) {
      if (flags.json) emit({ ok: summary.ok, dryRun: true, detection, choices, summary, warnings });
      return summary.ok ? 0 : 1;
    }
    if (!flags.yes) {
      if (!isTTY || flags.json) throw new Error('Use --yes to apply without interaction or --dry-run to preview');
      if (!await confirm()) throw new Cancellation();
    }
    if (plan.preparation.fetchLater && summary.actions.some((a) => a.owner === 'ecc' && !['same', 'conflict'].includes(a.situation))) {
      paths.ecc = await thirdParty.fetchEcc(plan.preparation.cache);
      plan = await preparePlan();
      summary = summarizePlan(plan, { home, force: flags.force });
      warnings = [...new Set([...warnings, ...summary.warnings])];
      if (!flags.json) printSummary(summary, out);
      if (!summary.ok || plan.preparation.pendingRules) throw new Error('Could not prepare ECC rules after fetching the cache');
    }
    // Nonempty directories are already expanded; copying them again would rewrite skipped files.
    const pendingActions = summary.actions.filter((a) => a.type !== 'summary' && a.situation !== 'same' && a.situation !== 'conflict'
      && (!a.directory || fs.readdirSync(a.source).length === 0));
    const result = pendingActions.length || !summary.actions.some((a) => a.situation === 'conflict')
      ? await apply(pendingActions, { home, force: flags.force ?? false, dryRun: false, choices })
      : { ok: true, dryRun: false, actions: [], conflicts: [], warnings: [], errors: [] };
    if (!result || typeof result.ok !== 'boolean'
      || ['actions', 'conflicts', 'warnings', 'errors'].some((field) => !Array.isArray(result[field]))) {
      throw new Error('Installation executor did not return a valid report');
    }
    result.conflicts.push(...summary.actions.filter((a) => a.situation === 'conflict'));
    result.ok &&= result.conflicts.length === 0;
    const codexHooks = (result.actions.some((a) => a.type === 'json-merge' && a.cli === 'codex'
      && ['executed', 'same'].includes(a.status)) || result.ok && summary.actions.some((a) => a.type === 'json-merge'
      && a.cli === 'codex' && a.situation !== 'conflict'))
      && !result.conflicts.some((a) => a.type === 'json-merge' && a.cli === 'codex');
    const finalWarnings = uniqueWarnings([...warnings, ...result.warnings, ...(codexHooks ? [CODEX_HOOK_APPROVAL] : [])]);
    if (flags.json) emit({ ...result, choices, summary, warnings: finalWarnings });
    else {
      for (const warning of finalWarnings) out(`Warning: ${warningText(warning)}`);
      for (const e of result.errors) err(`Error: ${e.message}`);
      out(`Applied: ${result.actions.length}; identical: ${summary.actions.filter((a) => a.situation === 'same').length}; conflicts: ${result.conflicts.length}.`);
    }
    return result.ok ? 0 : 1;
  } catch (e) {
    const cancelled = e instanceof Cancellation;
    if (flags?.json || argv.includes('--json')) emit({ ok: false, ...(cancelled ? { cancelled: true } : {}), error: e.message, warnings });
    else { for (const warning of warnings) out(`Warning: ${warning}`); err(e.message); }
    return cancelled ? 0 : errorCode;
  }
}

if (process.argv[1]) {
  let entryPath = path.resolve(process.argv[1]);
  try { entryPath = fs.realpathSync(entryPath); } catch { /* Keep the resolved path if it cannot be read. */ }
  if (entryPath === fileURLToPath(import.meta.url)) process.exitCode = await main();
}
