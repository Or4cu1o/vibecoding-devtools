import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, summarizePlan, planInstallation, formatDetection } from './cli.mjs';
import { execute } from './execute.mjs';
import { statePath, readState } from './state.mjs';
import { choicesFromFlags, Cancellation } from './panel.mjs';
import * as thirdPartyApi from './third-party.mjs';

const detection = () => ({ node: { ok: true, version: '22.0.0', minimum: 22 }, git: { ok: true, version: '2.0.0' }, gitleaks: { ok: false, error: 'missing' }, clis: [{ id: 'codex', name: 'Codex', state: 'ok', filePath: '/bin/codex' }], project: { inRepository: false, reason: 'outside git', stacks: [] },
  plugins: Object.fromEntries(['claude', 'codex', 'agy'].map((cli) => [cli, { state: 'known', items: [] }])) });
const write = (destination, content = 'kit') => ({ type: 'write', owner: 'kit', cli: 'codex', destination, content });
function environment(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const stdout = [], stderr = [];
  return { root, home, stdout, stderr, isTTY: false, out: (s) => stdout.push(s), err: (s) => stderr.push(s), detect: detection,
    choose: () => { throw new Error('panel called without TTY'); }, confirm: () => { throw new Error('confirmation called without TTY'); },
    planBuilder: () => [write(path.join(home, 'file'))] };
}
const json = (op) => { assert.equal(op.stdout.length, 1); return JSON.parse(op.stdout[0]); };

test('Detection returns JSON and an exit code without creating state or opening the panel', async (t) => {
  const op = environment(t);
  assert.equal(await main(['detect', '--json'], op), 0);
  assert.deepEqual(json(op), detection());
  assert.equal(fs.existsSync(op.home), false);
  op.stdout.length = 0;
  assert.equal(await main(['detect', '--json'], { ...op, detect: () => ({ ...detection(), git: { ok: false } }) }), 1);
  assert.equal(json(op).git.ok, false);
});

test('Default install with --yes uses the contract and records state without a TTY', async (t) => {
  const op = environment(t);
  let received;
  assert.equal(await main(['--yes', '--json', '--maestri'], { ...op, planBuilder: (and, d, paths) => { received = { and, d, paths }; return op.planBuilder(); } }), 0);
  assert.equal(fs.readFileSync(path.join(op.home, 'file'), 'utf8'), 'kit');
  assert.equal(received.and.maestri, true);
  assert.deepEqual(received.and.clis, ['codex']);
  assert.equal(received.paths.home, op.home);
  assert.deepEqual(received.d.installed.state.items, []);
  assert.equal(json(op).warnings.length, 1);
  assert.equal(readState({ home: op.home }).items.length, 1);
});

test('JSON dry-run without a TTY or --yes writes nothing', async (t) => {
  const op = environment(t);
  assert.equal(await main(['--dry-run', '--json'], op), 0);
  assert.equal(json(op).summary.actions[0].situation, 'new');
  assert.equal(fs.existsSync(op.home), false);
});

test('Writing and uninstalling without a TTY require --yes', async (t) => {
  const op = environment(t);
  assert.equal(await main(['--json'], op), 1);
  assert.match(json(op).error, /--yes/);
  assert.equal(fs.existsSync(op.home), false);
  op.stdout.length = 0;
  execute(op.planBuilder(), { home: op.home });
  assert.equal(await main(['uninstall', '--json'], op), 1);
  assert.match(json(op).error, /--yes/);
  assert.equal(fs.existsSync(path.join(op.home, 'file')), true);
});

test('Missing prerequisites stop before choices or execution; gitleaks only warns', async (t) => {
  const op = environment(t);
  assert.equal(await main(['--yes', '--json'], { ...op, detect: () => ({ ...detection(), node: { ok: false } }) }), 1);
  assert.match(json(op).error, /Node >=22/);
  assert.equal(fs.existsSync(op.home), false);
});

test('Summary distinguishes new, same, update and conflict without adopting identical external files', (t) => {
  const op = environment(t);
  const destination = path.join(op.home, 'file');
  assert.equal(summarizePlan(op.planBuilder(), { home: op.home }).actions[0].situation, 'new');
  execute(op.planBuilder(), { home: op.home });
  assert.equal(summarizePlan(op.planBuilder(), { home: op.home }).actions[0].situation, 'same');
  assert.equal(summarizePlan([write(destination, 'replacement')], { home: op.home }).actions[0].situation, 'update');
  fs.writeFileSync(destination, 'edit');
  assert.equal(summarizePlan(op.planBuilder(), { home: op.home }).actions[0].situation, 'conflict');
  assert.equal(summarizePlan(op.planBuilder(), { home: op.home, force: true }).actions[0].situation, 'update');
  const other = path.join(op.home, 'other');
  fs.writeFileSync(other, 'kit');
  assert.equal(summarizePlan([write(other)], { home: op.home }).actions[0].situation, 'same');
  assert.equal(summarizePlan([write(other)], { home: op.home, force: true }).actions[0].situation, 'same');
});

test('Identical files are skipped; conflicts remain until force replaces them', async (t) => {
  const op = environment(t);
  execute(op.planBuilder(), { home: op.home });
  const before = fs.readFileSync(statePath(op.home), 'utf8');
  assert.equal(await main(['--yes', '--json'], op), 0);
  assert.equal(json(op).actions.length, 0);
  assert.equal(fs.readFileSync(statePath(op.home), 'utf8'), before);
  op.stdout.length = 0;
  fs.writeFileSync(path.join(op.home, 'file'), 'edit');
  assert.equal(await main(['--yes', '--json'], op), 1);
  assert.equal(json(op).conflicts.length, 1);
  assert.equal(fs.readFileSync(path.join(op.home, 'file'), 'utf8'), 'edit');
  op.stdout.length = 0;
  assert.equal(await main(['--yes', '--force', '--json'], op), 0);
  assert.equal(json(op).actions.length, 1);
  assert.equal(fs.readFileSync(path.join(op.home, 'file'), 'utf8'), 'kit');
});

test('Directory copies skip identical files and preserve conflicts', async (t) => {
  const op = environment(t);
  const source = path.join(op.root, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'a'), 'a');
  fs.writeFileSync(path.join(source, 'b'), 'b');
  const plan = [{ type: 'copy', owner: 'kit', cli: 'codex', source, destination: path.join(op.home, 'skill') }];
  const config = { ...op, planBuilder: () => plan };
  assert.equal(await main(['--yes', '--json'], config), 0);
  op.stdout.length = 0;
  fs.writeFileSync(path.join(op.home, 'skill', 'b'), 'edit');
  assert.equal(await main(['--yes', '--json'], config), 1);
  assert.equal(json(op).actions.length, 0);
  assert.equal(fs.readFileSync(path.join(op.home, 'skill', 'b'), 'utf8'), 'edit');
});

test('Uninstall supports dry-run and --yes without a TTY and warns about modified files', async (t) => {
  const op = environment(t);
  execute([...op.planBuilder(), write(path.join(op.home, 'edited'))], { home: op.home });
  fs.writeFileSync(path.join(op.home, 'edited'), 'edit');
  assert.equal(await main(['uninstall', '--dry-run', '--json'], op), 0);
  assert.equal(json(op).warnings.length, 1);
  assert.equal(fs.existsSync(path.join(op.home, 'file')), true);
  op.stdout.length = 0;
  assert.equal(await main(['uninstall', '--yes', '--json'], op), 0);
  assert.ok(json(op).warnings.some((a) => a.reason.includes('Modified')));
  assert.equal(fs.existsSync(path.join(op.home, 'file')), false);
  assert.equal(fs.existsSync(path.join(op.home, 'edited')), true);
});

test('TTY confirmation follows the summary; rejection and cancellation write nothing', async (t) => {
  const op = environment(t);
  let calls = 0;
  const tty = { ...op, isTTY: true, choose: async (d) => choicesFromFlags({}, d), confirm: async () => { calls++; assert.ok(op.stdout.some((s) => s.includes('Summary:'))); return false; } };
  assert.equal(await main([], tty), 0);
  assert.equal(calls, 1);
  assert.equal(fs.existsSync(op.home), false);
  assert.equal(await main([], { ...tty, choose: () => { throw new Cancellation(); } }), 0);
  assert.equal(calls, 1);
  assert.equal(await main([], { ...tty, confirm: async () => true }), 0);
  assert.equal(fs.existsSync(path.join(op.home, 'file')), true);
});

test('Real kit plan and executor integrate in a temporary home', async (t) => {
  const op = environment(t);
  const { planBuilder, ...config } = op;
  assert.equal(await main(['--yes', '--json', '--clis=codex'], config), 0);
  assert.equal(json(op).ok, true);
  assert.ok(fs.existsSync(path.join(op.home, '.codex', 'AGENTS.md')));
  op.stdout.length = 0;
  assert.equal(await main(['--yes', '--json', '--clis=codex'], config), 0);
  assert.equal(json(op).actions.length, 0);
});

test('Same plans preserve AGENTS templates with blocks and identical external installations', async (t) => {
  const op = environment(t);
  const { planBuilder, ...config } = op;
  const project = path.join(op.root, 'project');
  fs.mkdirSync(project);
  config.detect = () => ({ ...detection(), project: { inRepository: true, root: project, stacks: [] } });
  const args = ['--yes', '--json', '--clis=codex', '--project'];
  assert.equal(await main(args, config), 0);
  op.stdout.length = 0;
  const agents = fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8');
  assert.equal(await main(args, config), 0);
  assert.equal(json(op).actions.length, 0);
  assert.equal(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8'), agents);
  const external = path.join(op.home, 'external');
  fs.writeFileSync(external, 'kit');
  const summary = summarizePlan([{ ...write(external), situation: 'same' }], { home: op.home });
  assert.equal(summary.actions[0].situation, 'same');
  assert.equal(readState({ home: op.home }).items.some((i) => i.destination === external), false);
});

test('Third-party integration preserves order, paths and dry-run summaries without a cache', async (t) => {
  const op = environment(t);
  assert.equal(await main(['--dry-run', '--json', '--ecc=claude'], { ...op, thirdParty: fakeThirdParty(op) }), 0);
  assert.ok(json(op).summary.actions.some((a) => a.type === 'summary' && a.description.includes('v2.2.3')));
  assert.equal(fs.existsSync(op.home), false);
  const choices = choicesFromFlags({ ecc: 'codex' }, detection());
  const before = structuredClone(choices);
  const thirdPartyItem = { type: 'command', owner: 'ecc', cli: 'codex', cmd: process.execPath, args: ['--version'] };
  const plan = await planInstallation(choices, detection(), { home: op.home }, {
    prepareThirdParty: async () => ({ actions: [thirdPartyItem], paths: { ecc: '/cache/ecc' } }),
    planBuilder: (and, d, paths) => { assert.equal(paths.ecc, '/cache/ecc'); return op.planBuilder(); },
  });
  assert.deepEqual([...plan], [thirdPartyItem, ...op.planBuilder()]);
  assert.deepEqual(choices, before);
});

// Use real third-party planning with substituted executables and source fetching.
function fakeThirdParty(op, { onFetch = () => {}, situation, warnings = [] } = {}) {
  const api = { ...thirdPartyApi };
  api.detectThirdParty = (home, project) => {
    assert.equal(home, op.home);
    return { ...thirdPartyApi.detectThirdParty(home, project), warnings };
  };
  api.thirdPartyActions = (choices, d, paths) => {
    const actual = thirdPartyApi.thirdPartyActions(choices, d, paths);
    const actions = actual.map((a) => {
      const telemetry = a.args.includes('telemetry');
      const file = path.join(op.home, a.owner === 'ecc' ? '.claude/ecc-simulated' : '.agents/impeccable-simulated');
      const code = telemetry ? '' : 'const fs=require("node:fs"),p=require("node:path");fs.mkdirSync(p.dirname(process.argv[1]),{recursive:true});fs.writeFileSync(process.argv[1],"thirdPartyItem")';
      return { ...a, cmd: process.execPath, args: ['-e', code, file],
        ...(situation ? { situation } : {}),
        ...(a.uninstall ? { uninstall: { cmd: process.execPath, args: ['-e', 'require("node:fs").unlinkSync(process.argv[1])', file], cwd: op.home } } : {}) };
    });
    actions.warnings = actual.warnings;
    return actions;
  };
  api.fetchEcc = (cache) => {
    assert.equal(cache, path.join(op.home, '.vibecoding-devtools/cache'));
    onFetch();
    const ecc = path.join(cache, 'ecc-2.2.3');
    for (const packageName of ['common', 'web', 'typescript']) {
      fs.mkdirSync(path.join(ecc, 'rules', packageName), { recursive: true });
      fs.writeFileSync(path.join(ecc, 'rules', packageName, 'style.md'), `# ${packageName}\n`);
    }
    return ecc;
  };
  return api;
}

function tree(root, prefix = '') {
  if (!fs.existsSync(root)) return {};
  const output = {};
  for (const name of fs.readdirSync(root).sort()) {
    const p = path.join(root, name), rel = prefix + name;
    if (fs.lstatSync(p).isDirectory()) Object.assign(output, { [rel + '/']: null }, tree(p, rel + '/'));
    else output[rel] = fs.readFileSync(p).toString('base64');
  }
  return output;
}

test('Offline end-to-end flow covers dry-run, confirmation, third parties, kit and uninstall', async (t) => {
  const op = environment(t);
  fs.mkdirSync(path.join(op.home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(op.home, '.codex/AGENTS.md'), 'Personal rules without final newline');
  fs.writeFileSync(path.join(op.home, 'personal'), 'do not change');
  const project = path.join(op.root, 'project');
  fs.mkdirSync(project);
  const initial = tree(op.home);
  let confirmations = 0, downloads = 0;
  const { planBuilder, ...config } = op;
  config.detect = () => ({ ...detection(), project: { inRepository: true, root: project, stacks: ['typescript'] } });
  config.thirdParty = fakeThirdParty(op, { onFetch: () => { assert.equal(confirmations, 1); downloads++; }, warnings: ['detection warning preserved'] });
  const flags = ['--clis=codex', '--ecc=claude', '--impeccable=codex'];
  assert.equal(await main([...flags, '--dry-run', '--json'], config), 0);
  const preview = json(op);
  assert.equal(downloads, 0);
  assert.deepEqual(tree(op.home), initial);
  assert.ok(preview.summary.actions.some((a) => a.type === 'summary' && /Download ECC v2.2.3/.test(a.description)));
  assert.ok(preview.warnings.some((a) => a.includes('detection warning')));
  assert.ok(preview.warnings.some((a) => a.includes('does not support uninstalling')));
  op.stdout.length = 0;
  assert.equal(await main(flags, { ...config, isTTY: true, confirm: async () => { confirmations++; assert.deepEqual(tree(op.home), initial); return true; } }), 0);
  assert.equal(downloads, 1);
  assert.ok(op.stdout.some((s) => s.includes('detection warning preserved')));
  assert.ok(fs.existsSync(path.join(op.home, '.claude/rules/ecc/common/style.md')));
  assert.ok(fs.existsSync(path.join(op.home, '.claude/ecc-simulated')));
  assert.ok(fs.existsSync(path.join(op.home, '.agents/impeccable-simulated')));
  op.stdout.length = 0;
  assert.equal(await main([...flags, '--yes', '--json'], config), 0);
  assert.equal(json(op).actions.length, 0);
  assert.equal(downloads, 1);
  op.stdout.length = 0;
  assert.equal(await main(['uninstall', '--yes', '--json'], config), 0);
  const removed = json(op);
  assert.ok(removed.warnings.some((a) => a.reason.includes('no registered uninstall')));
  assert.ok(removed.warnings.some((a) => a.item?.args?.includes(path.join(op.home, '.agents/impeccable-simulated'))));
  assert.ok(removed.warnings.some((a) => a.destination === path.join(op.home, '.vibecoding-devtools')));
  const final = tree(op.home);
  for (const [p, content] of Object.entries(initial)) assert.equal(final[p], content, p);
  const exceptions = removed.warnings.filter((a) => a.destination).map((a) => path.relative(op.home, a.destination).split(path.sep).join('/'));
  // Impeccable has in inverse: its command and original warning remain in state.
  exceptions.push('.agents/impeccable-simulated');
  assert.ok(readState({ home: op.home }).items.every((i) => i.type === 'command' && i.owner === 'impeccable'));
  for (const p of Object.keys(final).filter((p) => !(p in initial))) {
    const filePath = p.replace(/\/$/, '');
    assert.ok(exceptions.some((and) => filePath === and || filePath.startsWith(and + '/') || (p.endsWith('/') && and.startsWith(p))), `Unreported remaining path: ${p}`);
  }
});

test('Rejection, JSON without --yes and cached dry-run never fetch ECC', async (t) => {
  const op = environment(t);
  let downloads = 0;
  const api = fakeThirdParty(op, { onFetch: () => { downloads++; } });
  const config = { ...op, thirdParty: api, isTTY: true, confirm: async () => false };
  assert.equal(await main(['--ecc=claude'], config), 0);
  assert.equal(downloads, 0);
  assert.equal(fs.existsSync(op.home), false);
  op.stdout.length = 0;
  assert.equal(await main(['--ecc=claude', '--json'], config), 1);
  assert.match(json(op).error, /--yes/);
  assert.equal(downloads, 0);
  api.fetchEcc(path.join(op.home, '.vibecoding-devtools/cache'));
  const before = tree(op.home);
  op.stdout.length = 0;
  const { planBuilder, ...real } = config;
  assert.equal(await main(['--ecc=claude', '--dry-run', '--json'], real), 0);
  assert.ok(!json(op).summary.actions.some((a) => a.type === 'summary'));
  assert.deepEqual(tree(op.home), before);
  assert.equal(downloads, 1);
});

test('Identical or conflicting commands never run even with force; warnings survive JSON', async (t) => {
  for (const situation of ['same', 'conflict']) {
    const op = environment(t);
    const config = { ...op, thirdParty: fakeThirdParty(op, { situation, warnings: ['warning preserved'] }) };
    // Only Impeccable is selected: in ECC rules need fetching and in command may create the fixture.
    const project = path.join(op.root, 'project');
    fs.mkdirSync(project);
    config.detect = () => ({ ...detection(), project: { inRepository: true, root: project, stacks: [] } });
    assert.equal(await main(['--clis=none', '--impeccable=codex', '--yes', '--force', '--json'], config), situation === 'conflict' ? 1 : 0);
    assert.ok(json(op).warnings.includes('warning preserved'));
    assert.equal(fs.existsSync(path.join(op.home, '.agents/impeccable-simulated')), false);
  }
});

test('CI installs the shrinkwrap before testing and runs detection with pinned actions', () => {
  const ci = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const job = ci.slice(ci.indexOf('  installer:'), ci.indexOf('  secrets:'));
  assert.ok(job.indexOf('npm ci --ignore-scripts') < job.indexOf('npm test'));
  assert.match(job, /node installer\/cli.mjs detect/);
  for (const [, ref] of ci.matchAll(/uses:\s+([^\s]+)/g)) assert.match(ref, /@[a-f0-9]{40}$/);
  assert.match(fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^node_modules\/$/m);
});

test('ECC download failure preserves warnings without commands or partial installation', async (t) => {
  const op = environment(t);
  let applications = 0;
  const thirdParty = fakeThirdParty(op, { warnings: ['warning before download'] });
  thirdParty.fetchEcc = () => { throw new Error('download simulated failed'); };
  assert.equal(await main(['--ecc=claude', '--yes', '--json'], { ...op, thirdParty, apply: () => { applications++; } }), 1);
  const result = json(op);
  assert.match(result.error, /download simulated failed/);
  assert.ok(result.warnings.includes('warning before download'));
  assert.equal(applications, 0);
  assert.equal(fs.existsSync(op.home), false);
});

test('Unknown plugins block ECC without fetching or execution even with force', async (t) => {
  const op = environment(t);
  const d = detection();
  d.plugins.claude = { state: 'unknown', items: null, error: 'timeout in query' };
  const thirdParty = fakeThirdParty(op);
  thirdParty.fetchEcc = () => assert.fail('ECC must not be fetched with unknown plugins');
  const config = { ...op, detect: () => structuredClone(d), thirdParty, planBuilder: () => [], apply: () => assert.fail('No action should be applied') };
  assert.equal(await main(['--clis=none', '--ecc=claude', '--yes', '--force', '--json'], config), 1);
  const r = json(op);
  assert.equal(r.conflicts.length, 1);
  assert.ok(r.warnings.some((a) => /plugin.*blocked/.test(a)));
  assert.equal(fs.existsSync(op.home), false);
});

test('Kit and third-party warnings appear in plans, summaries and final reports', async (t) => {
  const op = environment(t);
  const prepareThirdParty = () => {
    const actions = [];
    actions.warnings = ['third-party command warning'];
    return { actions, warnings: ['third-party warning'] };
  };
  const planBuilder = () => {
    const plan = op.planBuilder();
    plan.warnings = ['Codex: 32 KiB budget required compaction'];
    return plan;
  };
  const expectedItems = ['third-party warning', 'third-party command warning', 'Codex: 32 KiB budget required compaction'];
  const plan = await planInstallation(choicesFromFlags({}, detection()), detection(), { home: op.home }, { prepareThirdParty, planBuilder });
  assert.deepEqual(plan.warnings, expectedItems);
  assert.equal(await main(['--dry-run', '--json'], { ...op, prepareThirdParty, planBuilder }), 0);
  let r = json(op);
  for (const warning of expectedItems) { assert.ok(r.warnings.includes(warning)); assert.ok(r.summary.warnings.includes(warning)); }
  op.stdout.length = 0;
  assert.equal(await main(['--yes', '--json'], { ...op, prepareThirdParty, planBuilder }), 0);
  r = json(op);
  for (const warning of expectedItems) assert.ok(r.warnings.includes(warning));
});

test('Invalid executor reports produce an explicit error without accessing undefined conflicts', async (t) => {
  for (const returned of [undefined, {}]) {
    const op = environment(t);
    assert.equal(await main(['--yes', '--json'], { ...op, apply: async () => returned }), 1);
    const r = json(op);
    assert.match(r.error, /valid report/);
    assert.doesNotMatch(r.error, /Cannot read properties/);
    assert.equal(fs.existsSync(op.home), false);
  }
});

test('Final text and JSON reports show the Impeccable warning once', async (t) => {
  const warning = 'Impeccable does not support uninstalling; manually check created files.';
  for (const jsonMode of [false, true]) {
    const op = environment(t);
    const config = { ...op,
      prepareThirdParty: () => ({ actions: [], warnings: [warning] }),
      apply: async () => {
        if (!jsonMode) op.out('start of final report');
        return { ok: true, actions: [], conflicts: [], errors: [], warnings: [warning, { reason: warning, owner: 'impeccable' }, { reason: warning, owner: 'impeccable' }] };
      },
    };
    assert.equal(await main(['--yes', ...(jsonMode ? ['--json'] : [])], config), 0);
    if (jsonMode) {
      const r = json(op);
      const warnings = r.warnings.filter((a) => (a.reason ?? a) === warning);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].owner, 'impeccable');
    } else {
      const end = op.stdout.slice(op.stdout.indexOf('start of final report') + 1);
      assert.equal(end.filter((s) => s.includes(warning)).length, 1);
    }
  }
});

test('CLI passes the disabled or explicitly enabled Impeccable hooks choice', async (t) => {
  for (const hooks of [false, true]) {
    const op = environment(t);
    let received;
    assert.equal(await main(['--yes', '--json', '--impeccable=codex', ...(hooks ? ['--impeccable-hooks'] : [])], {
      ...op, prepareThirdParty: (choices) => { received = choices; return { actions: [] }; },
    }), 0);
    assert.equal(received.impeccable.hooks, hooks);
    assert.equal(json(op).choices.impeccable.hooks, hooks);
  }
});

test('Real Codex budget overflow is reported before execution and preserves home', async (t) => {
  const op = environment(t);
  fs.mkdirSync(path.join(op.home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(op.home, '.codex/AGENTS.md'), 'x'.repeat(40 * 1024));
  const before = tree(op.home);
  const { planBuilder, ...config } = op;
  config.apply = () => assert.fail('Budget overflow must not reach the executor');
  assert.equal(await main(['--clis=codex', '--yes', '--json'], config), 1);
  assert.match(json(op).error, /32 KiB/);
  assert.deepEqual(tree(op.home), before);
});

test('Text output explains missing CLIs, off-PATH CLIs, errors and stacks', () => {
  const d = detection();
  d.clis = [{ name: 'Claude', state: 'missing', install: 'install claude' }, { name: 'Codex', state: 'off-path', directory: '/bin', version: '1' }, { name: 'AGY', state: 'error', filePath: '/agy', error: 'failed' }];
  d.project = { inRepository: true, root: '/repo', stacks: ['python'] };
  const text = formatDetection(d);
  for (const fragment of ['install claude', 'Add this directory to PATH', 'failed', 'python', 'gitleaks']) assert.ok(text.includes(fragment));
});

test('Real noninteractive binary returns help and JSON errors without hanging', () => {
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--ecc-stacks/);
  assert.match(help.stdout, /--impeccable-hooks/);
  assert.match(help.stdout, /0 success; 1 something was skipped, blocked or failed; 2 usage error/);
  const error = spawnSync(process.execPath, [cli, 'invalid', '--json'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(error.status, 2);
  assert.equal(JSON.parse(error.stdout).ok, false);
  assert.equal(error.stderr, '');
});

test('Package and shrinkwrap pin clack 1.8.1 with dependency integrity', () => {
  const packageName = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(new URL('../npm-shrinkwrap.json', import.meta.url), 'utf8'));
  assert.equal(packageName.dependencies['@clack/prompts'], '1.8.1');
  assert.equal(lock.packages[''].dependencies['@clack/prompts'], '1.8.1');
  assert.equal(lock.packages['node_modules/@clack/prompts'].version, '1.8.1');
  for (const [name, p] of Object.entries(lock.packages)) if (name) { assert.ok(p.integrity); assert.ok(p.resolved.startsWith('https://registry.npmjs.org/')); }
});
