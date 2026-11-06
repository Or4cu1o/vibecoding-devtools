import { parseArgs } from 'node:util';
import * as clack from '@clack/prompts';

export const CLIS = ['claude', 'codex', 'agy'];
export const STACKS = ['typescript', 'python', 'golang', 'rust', 'java', 'kotlin', 'php', 'ruby', 'swift', 'csharp', 'fsharp', 'dart', 'cpp', 'perl', 'arkts', 'react', 'react-native', 'vue', 'nuxt', 'angular'];
const names = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' };
const uniqueList = (value, allowed, name) => {
  const items = value === '' || value === 'none' ? [] : value.split(',').map((s) => s.trim());
  if (items.some((s) => !allowed.includes(s))) throw new Error(`Invalid ${name}: ${value}`);
  return [...new Set(items)];
};

export function parseFlags(args = []) {
  const booleans = ['dry-run', 'yes', 'force', 'json', 'maestri', 'no-maestri', 'hooks', 'no-hooks', 'ecc-hooks', 'no-ecc-hooks', 'impeccable-hooks', 'no-impeccable-hooks', 'project', 'help'];
  const strings = ['clis', 'cli', 'scope', 'ecc', 'ecc-clis', 'ecc-stacks', 'stacks', 'impeccable', 'impeccable-clis'];
  const options = Object.fromEntries([...booleans.map((k) => [k, { type: 'boolean' }]), ...strings.map((k) => [k, { type: 'string' }])]);
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true, strict: true });
  if (positionals.length > 1) throw new Error('Specify only one command');
  const command = positionals[0] ?? 'install';
  if (!['install', 'update', 'detect', 'uninstall'].includes(command)) throw new Error(`Unknown command: ${command}`);
  for (const [a, b] of [['clis', 'cli'], ['ecc', 'ecc-clis'], ['ecc-stacks', 'stacks'], ['impeccable', 'impeccable-clis']]) {
    if (values[a] !== undefined && values[b] !== undefined) throw new Error(`Use only --${a} or --${b}`);
  }
  if (values.project && values.scope && values.scope !== 'project') throw new Error('--project conflicts with --scope');
  for (const name of ['maestri', 'hooks', 'ecc-hooks', 'impeccable-hooks']) {
    if (values[name] && values[`no-${name}`]) throw new Error(`Use only --${name} or --no-${name}`);
  }
  return { command, ...values,
    hasChoices: [...strings, 'project', 'maestri', 'no-maestri', 'hooks', 'no-hooks', 'ecc-hooks', 'no-ecc-hooks', 'impeccable-hooks', 'no-impeccable-hooks'].some((k) => values[k] !== undefined) };
}

export function choicesFromFlags(flags, detection, saved) {
  if (saved) {
    // Normalize aliases before merging, so an explicit alias wins over saved choices.
    const scope = flags.project ? 'project' : flags.scope ?? saved.scope;
    const ecc = flags.ecc ?? flags['ecc-clis'] ?? saved.ecc.clis.join(',');
    const impeccable = flags.impeccable ?? flags['impeccable-clis'] ?? saved.impeccable.clis.join(',');
    flags = { ...flags, scope, clis: flags.clis ?? flags.cli ?? saved.clis.join(','), ecc, impeccable,
      maestri: flags.maestri ?? saved.maestri, hooks: flags.hooks ?? saved.hooks,
      'ecc-hooks': flags['ecc-hooks'] ?? (ecc && ecc !== 'none' ? saved.ecc.hooks : false),
      'impeccable-hooks': flags['impeccable-hooks'] ?? (impeccable && impeccable !== 'none' ? saved.impeccable.hooks : false),
      'ecc-stacks': flags['ecc-stacks'] ?? flags.stacks ?? (scope === 'project' && ecc && ecc !== 'none' ? saved.ecc.stacks.join(',') : '') };
  }
  flags = { ...flags };
  for (const name of ['maestri', 'hooks', 'ecc-hooks', 'impeccable-hooks']) {
    if (flags[`no-${name}`]) flags[name] = false;
  }
  const clis = flags.clis ?? flags.cli;
  const targets = clis === undefined ? (detection.clis ?? []).filter((c) => ['ok', 'off-path'].includes(c.state)).map((c) => c.id) : uniqueList(clis, CLIS, 'CLI');
  const scope = flags.project ? 'project' : flags.scope ?? 'global';
  if (!['global', 'project'].includes(scope)) throw new Error('Scope must be global or project');
  if (scope === 'project' && (!detection.project?.inRepository || !detection.project.root)) throw new Error('Project scope requires a git repository');
  const eccClis = uniqueList(flags.ecc ?? flags['ecc-clis'] ?? '', ['claude', 'codex'], 'ECC CLI');
  const impeccableClis = uniqueList(flags.impeccable ?? flags['impeccable-clis'] ?? '', CLIS, 'Impeccable CLI');
  const stacksFlag = flags['ecc-stacks'] ?? flags.stacks;
  const stacks = stacksFlag === undefined ? (scope === 'project' && eccClis.length ? detection.project.stacks ?? [] : []) : uniqueList(stacksFlag, STACKS, 'ECC package');
  if (flags['ecc-hooks'] && !eccClis.length) throw new Error('--ecc-hooks requires --ecc with CLIs');
  if (flags['impeccable-hooks'] && !impeccableClis.length) throw new Error('--impeccable-hooks requires --impeccable with CLIs');
  if (stacks.length && (!eccClis.length || scope !== 'project')) throw new Error('Stack packages require ECC and project scope');
  return { clis: targets, scope, ...(scope === 'project' ? { root: detection.project.root } : {}), maestri: flags.maestri ?? false,
    hooks: flags['no-hooks'] ? false : flags.hooks ?? true,
    ecc: { clis: eccClis, hooks: flags['ecc-hooks'] ?? false, stacks: [...stacks] }, impeccable: { clis: impeccableClis, hooks: flags['impeccable-hooks'] ?? false } };
}

export class Cancellation extends Error {
  constructor() { super('Operation cancelled'); this.name = 'Cancellation'; }
}

export async function confirmExecution({ prompts = clack } = {}) {
  const answer = await prompts.confirm({ message: 'Apply the summary actions?', initialValue: false });
  if (prompts.isCancel(answer)) throw new Cancellation();
  return answer;
}

export async function panel(detection, { prompts = clack } = {}) {
  const ask = async (type, options) => {
    const answer = await prompts[type](options);
    if (prompts.isCancel(answer)) throw new Cancellation();
    return answer;
  };
  const cliOptions = CLIS.map((value) => ({ value, label: names[value], hint: detection.clis?.find((c) => c.id === value)?.state ?? 'missing' }));
  const defaults = choicesFromFlags({}, detection);
  const clis = await ask('multiselect', { message: 'Target CLIs for the kit', options: cliOptions, initialValues: defaults.clis, required: false });
  const scope = await ask('select', { message: 'Installation scope', initialValue: 'global', options: [
    { value: 'global', label: 'Global' }, ...(detection.project?.inRepository ? [{ value: 'project', label: `Project: ${detection.project.root}` }] : []),
  ] });
  const maestri = await ask('confirm', { message: 'Include the Maestri pack?', initialValue: false });
  const kitHooks = await ask('confirm', { message: 'Install kit hooks?', initialValue: true });
  const eccClis = await ask('multiselect', { message: 'Which CLIs should receive ECC?', options: cliOptions.filter(({ value }) => value !== 'agy'), initialValues: [], required: false });
  let hooks = false;
  let stacks = [];
  if (eccClis.length) {
    hooks = await ask('confirm', { message: 'Enable ECC hooks?', initialValue: false });
    if (scope === 'project') stacks = await ask('multiselect', { message: 'ECC stack rule packages', options: STACKS.map((value) => ({ value, label: value })), initialValues: (detection.project.stacks ?? []).filter((s) => STACKS.includes(s)), required: false });
  }
  const impeccableClis = await ask('multiselect', { message: 'Which CLIs should receive Impeccable?', options: cliOptions, initialValues: [], required: false });
  const impeccableHooks = impeccableClis.length ? await ask('confirm', { message: 'Enable Impeccable hooks?', initialValue: false }) : false;
  return choicesFromFlags({ clis: clis.join(','), scope, maestri, hooks: kitHooks, ecc: eccClis.join(','), 'ecc-hooks': hooks, 'ecc-stacks': stacks.join(','), impeccable: impeccableClis.join(','), 'impeccable-hooks': impeccableHooks }, detection);
}
