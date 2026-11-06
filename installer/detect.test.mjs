import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { thirdPartyActions } from "./third-party.mjs";
import * as thirdPartyApi from "./third-party.mjs";
import { main } from "./cli.mjs";
import { detectCli, detectInstalled, detectAll, expand, extractVersion, detectStacks, checkNode,
  findIn, checkTool, parsePlugins } from "./detect.mjs";

const WIN = process.platform === "win32";

// Create fake executables that print a version and exit with a supplied code on each platform.
function fakeCli(directory, bin, output, code = 0) {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, WIN ? `${bin}.cmd` : bin);
  fs.writeFileSync(
    filePath,
    WIN ? `@echo ${output}\r\n@exit /b ${code}\r\n` : `#!/bin/sh\necho "${output}"\nexit ${code}\n`,
  );
  if (!WIN) fs.chmodSync(filePath, 0o755);
  return filePath;
}

const CLI = {
  id: "test",
  name: "Test",
  bin: "test-cli",
  directories: { unix: ["~/outside/bin"], win: ["%LOCALAPPDATA%\\outside\\bin"] },
  install: { unix: "install-unix", win: "install-win" },
};

function environment(root, withPath) {
  return {
    PATH: withPath ? path.join(root, "path") : path.join(root, "empty"),
    PATHEXT: ".EXE;.CMD",
    LOCALAPPDATA: root,
    HOME: root,
    USERPROFILE: root,
  };
}

test("Extract versions from actual CLI output", () => {
  assert.equal(extractVersion("2.1.302 (Claude Code)"), "2.1.302");
  assert.equal(extractVersion("codex-cli 0.164.0"), "0.164.0");
  assert.equal(extractVersion("1.4.9"), "1.4.9");
  assert.equal(extractVersion("without version"), null);
});

test("Expand home and environment variables", () => {
  assert.equal(expand("~/.local/bin", { home: "/h" }), "/h/.local/bin");
  assert.equal(expand("%LOCALAPPDATA%\\agy\\bin", { env: { LOCALAPPDATA: "C:\\L" } }), "C:\\L\\agy\\bin");
  assert.equal(expand("%DOES_NOT_EXIST%\\x", { env: {} }), "%DOES_NOT_EXIST%\\x");
});

test("Reject Node below the minimum version", () => {
  assert.equal(checkNode("20.11.0").ok, false);
  assert.equal(checkNode("22.0.0").ok, true);
});

test("CLI on PATH returns its path and version", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fakeCli(path.join(root, "path"), "test-cli", "test-cli 1.2.3");
  const r = detectCli(CLI, { env: environment(root, true) });
  assert.equal(r.state, "ok");
  assert.equal(r.version, "1.2.3");
});

test("CLI in a known directory outside PATH is detected", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fakeCli(path.join(root, "outside", "bin"), "test-cli", "test-cli 4.5.6");
  const r = detectCli(CLI, { env: environment(root, false) });
  assert.equal(r.state, "off-path");
  assert.equal(r.version, "4.5.6");
});

test("CLI failing --version returns error instead of ok", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fakeCli(path.join(root, "path"), "test-cli", "broken", 1);
  const r = detectCli(CLI, { env: environment(root, true) });
  assert.equal(r.state, "error");
});

test("Read quoted PATH directories", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fakeCli(path.join(root, "path"), "test-cli", "test-cli 7.8.9");
  const env = { ...environment(root, true), PATH: `"${path.join(root, "path")}"` };
  assert.equal(detectCli(CLI, { env }).version, "7.8.9");
});

test("Missing CLI returns the official installation command", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const r = detectCli(CLI, { env: environment(root, false) });
  assert.equal(r.state, "missing");
  assert.equal(r.install, WIN ? "install-win" : "install-unix");
});

test("Detect stacks from files and dependencies", () => {
  assert.deepEqual(detectStacks({ files: ["go.mod", "README.md"] }), ["golang"]);
  assert.deepEqual(detectStacks({ files: ["package.json"], dependencies: ["next", "react"] }), ["react", "typescript"]);
  assert.deepEqual(detectStacks({ files: ["pyproject.toml", "App.csproj"] }), ["csharp", "python"]);
  assert.deepEqual(detectStacks({ files: ["notes.txt"] }), []);
});

function installedHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-installed-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test("Read global and project state and matching skills without running missing CLIs", (t) => {
  const home = installedHome(t);
  const project = path.join(home, "project");
  const state = { version: "0.0.1", items: [{ type: "copy", destination: "registered", owner: "kit" }] };
  fs.mkdirSync(path.join(home, ".vibecoding-devtools"));
  fs.writeFileSync(path.join(home, ".vibecoding-devtools", "state.json"), JSON.stringify(state));
  const locations = [
    [home, ".claude", "skills"], [home, ".agents", "skills"], [home, ".gemini", "config", "skills"],
    [project, ".claude", "skills"], [project, ".agents", "skills"],
  ];
  for (const local of locations) {
    fs.mkdirSync(path.join(...local, "risk-triage"), { recursive: true });
    fs.mkdirSync(path.join(...local, "other-skill"));
  }
  const result = detectInstalled({ home, project, executePlugins: () => assert.fail("CLI not detected") });
  assert.deepEqual(result.state, state);
  assert.equal(result.skills.length, 6); // .agents/ of project responds two CLIs.
  assert.ok(result.skills.every((s) => s.name === "risk-triage" && s.filePath.startsWith(home)));
  assert.deepEqual(result.skills.filter((s) => s.scope === "project").map((s) => s.cli),
    ["claude", "codex", "agy"]);
  assert.ok(Object.values(result.plugins).every((p) => p.state === "unknown" && p.items === null));
});

test("Plugin queries use detected binaries, official arguments, fake home and large catalog limits", (t) => {
  const home = installedHome(t);
  fs.mkdirSync(path.join(home, ".claude"));
  fs.mkdirSync(path.join(home, ".codex"));
  const calls = [];
  const clis = ["claude", "codex", "agy"].map((id) => ({ id, filePath: path.join(home, `${id}.exe`),
    state: id === "codex" ? "off-path" : "ok" }));
  const result = detectInstalled({ home, clis, executePlugins: (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return { status: 0, stdout: cmd.endsWith("agy.exe")
      ? '{"plugins":[{"name":"impeccable","version":"4.8.0","installed":true}]}'
      : "ecc@ecc installed, enabled 2.2.3\n" };
  } });
  assert.equal(calls.length, 3);
  for (const [i, c] of calls.entries()) {
    assert.equal(c.cmd, clis[i].filePath);
    assert.deepEqual(c.args, ["plugin", "list", ...(i === 2 ? ["--json"] : [])]);
    assert.equal(c.options.timeout, 30000);
    assert.equal(c.options.maxBuffer, 64 * 1024 * 1024);
    assert.equal(c.options.cwd, home);
    assert.equal(c.options.env.HOME, home);
    assert.equal(c.options.env.USERPROFILE, home);
    assert.equal(c.options.env.CODEX_HOME, path.join(home, ".codex"));
    assert.equal(c.options.env.CLAUDE_CONFIG_DIR, path.join(home, ".claude"));
  }
  assert.equal(result.plugins.agy.items[0].name, "impeccable");
  assert.match(result.plugins.codex.output, /ecc@ecc/);
  assert.ok(Object.values(result.plugins).every((p) => p.state === "known"));
});

test("Codex tables over 2 MB preserve ECC and Impeccable for third-party planning", (t) => {
  const home = installedHome(t);
  fs.mkdirSync(path.join(home, ".codex"));
  const ecc = "| ecc@ecc | 2.2.3 | installed, enabled |";
  const impeccable = "| impeccable | 4.8.0 | installed, enabled |";
  const line = "| other-catalog-plugin | 1.0.0 | not installed | description of another plugin available in the catalog |\n";
  const end = `${ecc}\n${impeccable}\n`;
  const code = `process.stdout.write('Name | Version | Status\\n' + ${JSON.stringify(line)}.repeat(40000)`
    + ` + ${JSON.stringify(end)})`;
  const clis = [{ id: "codex", filePath: path.join(home, "codex.exe"), state: "ok" }];
  let calls = 0;
  const installed = detectInstalled({ home, clis, executePlugins: (cmd, args, options) => {
    calls++;
    assert.equal(cmd, clis[0].filePath);
    assert.deepEqual(args, ["plugin", "list"]);
    assert.equal(options.timeout, 30000);
    assert.equal(options.maxBuffer, 64 * 1024 * 1024);
    // Local fixture process exercises spawnSync stdout limits without CLI or network access.
    return spawnSync(process.execPath, ["-e", code], options);
  } });
  assert.equal(calls, 1);
  assert.equal(installed.plugins.codex.state, "known");
  assert.ok(Buffer.byteLength(installed.plugins.codex.output) > 2 * 1024 * 1024);
  assert.equal(installed.plugins.codex.items.find((i) => i.name === "ecc@ecc").installed, true);
  assert.equal(installed.plugins.codex.items.find((i) => i.name === "impeccable").installed, true);
  assert.equal(installed.plugins.codex.items[0].installed, false);
  const actions = thirdPartyActions({ scope: "global", ecc: { clis: ["codex"] },
    impeccable: { clis: ["codex"] } }, { installed }, { home });
  assert.ok(actions.filter((a) => a.owner === "ecc").every((a) => a.situation === "same"));
  assert.equal(actions.find((a) => a.owner === "impeccable" && a.args.includes("install")).situation, "same");
});

test("Codex reads real STATUS values and distinguishes installed plugins from catalog entries", (t) => {
  const home = installedHome(t);
  fs.mkdirSync(path.join(home, ".codex"));
  const stdout = "Name Status Version\n"
    + "ecc@ecc installed, enabled 2.2.3\n"
    + "impeccable@openai-curated-remote not installed 4.3.1\n";
  const installed = detectInstalled({ home,
    clis: [{ id: "codex", filePath: path.join(home, "codex.exe"), state: "ok" }],
    executePlugins: () => ({ status: 0, stdout }) });
  const items = installed.plugins.codex.items;
  assert.equal(installed.plugins.codex.state, "known");
  assert.deepEqual(items.map((i) => [i.name, i.status, i.version, i.installed]), [
    ["ecc@ecc", "installed, enabled", "2.2.3", true],
    ["impeccable@openai-curated-remote", "not installed", "4.3.1", false],
  ]);
  const actions = thirdPartyActions({ scope: "global", ecc: { clis: ["codex"] },
    impeccable: { clis: ["codex"] } }, { installed }, { home });
  assert.ok(actions.filter((a) => a.owner === "ecc").every((a) => a.situation === "same"));
  assert.equal(actions.find((a) => a.owner === "impeccable" && a.args.includes("install")).situation, "new");
  assert.equal(parsePlugins("codex", "ecc@ecc enabled 2.2.3")[0].installed, null);
});

test("Codex reads real tables preceded by marketplace headers and paths", () => {
  const output = "Marketplace `ecc`\r\n"
    + "C:\\Users\\Test\\.codex\\.tmp\\marketplaces\\ecc\\.agents\\plugins\\marketplace.json\r\n\r\n"
    + "PLUGIN   STATUS              VERSION  SOURCE\r\n"
    + "ecc@ecc  installed, enabled  2.2.3    C:\\Users\\Test\\.codex\\.tmp\\marketplaces\\ecc\r\n\r\n"
    + "Marketplace `other`\r\n"
    + "C:\\Users\\Test\\.codex\\.tmp\\marketplaces\\other\\.agents\\plugins\\marketplace.json\r\n\r\n"
    + "PLUGIN   STATUS          VERSION  SOURCE\r\n"
    + "other@other  not installed  1.0.0    C:\\Users\\Test\\.codex\\.tmp\\marketplaces\\other\r\n";
  assert.deepEqual(parsePlugins("codex", output).map(({ name, status, version, installed }) =>
    [name, status, version, installed]), [
    ["ecc@ecc", "installed, enabled", "2.2.3", true],
    ["other@other", "not installed", "1.0.0", false],
  ]);
});

test("Real empty Codex and Claude lists are known; isolated warnings remain unknown", (t) => {
  const codex = "WARNING: The following directories are not on PATH: aliases\nNo marketplace plugins found.";
  const claude = "No plugins installed. Use \x60claude plugin install\x60 to install a plugin.\r\n";
  assert.deepEqual(parsePlugins("codex", codex), []);
  assert.deepEqual(parsePlugins("claude", claude), []);
  assert.throws(() => parsePlugins("codex", "WARNING: alias path notice"), /Unrecognized plugin response format/);
  const home = installedHome(t);
  fs.mkdirSync(path.join(home, ".codex"));
  fs.mkdirSync(path.join(home, ".claude"));
  const clis = ["codex", "claude"].map((id) => ({ id, filePath: path.join(home, `${id}.exe`), state: "ok" }));
  const result = detectInstalled({ home, clis, executePlugins: (cmd) => ({ status: 0,
    stdout: cmd.endsWith("codex.exe") ? codex : claude }) });
  assert.equal(result.plugins.codex.state, "known");
  assert.deepEqual(result.plugins.codex.items, []);
  assert.equal(result.plugins.claude.state, "known");
  assert.deepEqual(result.plugins.claude.items, []);
});

test('Incomplete or diagnostic plugin responses stay unknown and block third-party installation', (t) => {
  const home = installedHome(t);
  for (const cli of ['claude', 'codex']) fs.mkdirSync(path.join(home, '.' + cli));
  const responses = {
    claude: [
      'Installed plugins:\nError: authentication failed',
      'Installed plugins:\nSynced from claude.ai:\n???',
      'Installed plugins:',
      'Installed plugins:\nSynced from claude.ai:',
      'Name | Version | Status',
      'Installed plugins:\n❯ other@local\nStatus: loaded\n???',
      'Installed plugins:\n❯ other@local\nStatus: loaded\nError: authentication failed',
      'Installed plugins:\nThis response is incomplete',
      'Installed plugins:\nVersion: 1.0.0',
    ],
    codex: [
      'PLUGIN STATUS VERSION SOURCE',
      'Name | Version | Status\n???',
      'Installed plugins:\nError: authentication failed',
      'Marketplace \x60ecc\x60',
      'ecc@ecc installed, enabled 2.2.3\n???',
      'ecc@ecc installed, enabled 2.2.3\nError: authentication failed',
    ],
  };
  for (const [cli, outputs] of Object.entries(responses)) for (const stdout of outputs) {
    assert.throws(() => parsePlugins(cli, stdout), /(?:Unrecognized|Incomplete) plugin response/, stdout);
    const installed = detectInstalled({ home,
      clis: [{ id: cli, filePath: process.execPath, state: 'ok' }],
      executePlugins: () => ({ status: 0, stdout }) });
    assert.equal(installed.plugins[cli].state, 'unknown', stdout);
    assert.equal(installed.plugins[cli].items, null, stdout);
    const actions = thirdPartyActions({ scope: 'global', ecc: { clis: [cli] }, impeccable: { clis: [cli] } },
      { installed }, { home });
    for (const owner of ['ecc', 'impeccable']) {
      const owned = actions.filter((action) => action.owner === owner && !action.args.includes('telemetry'));
      assert.ok(owned.length > 0);
      assert.ok(owned.every((action) => action.situation === 'conflict'), stdout);
    }
  }
});

test("Missing Claude and Codex configuration returns empty lists without running CLIs or creating directories", (t) => {
  const home = installedHome(t);
  const clis = ["claude", "codex"].map((id) => ({ id, filePath: process.execPath, state: "ok" }));
  const result = detectInstalled({ home, clis,
    executePlugins: () => assert.fail("plugin list must not run without the configuration directory") });
  for (const cli of ["claude", "codex"]) {
    assert.deepEqual(result.plugins[cli].items, []);
    assert.equal(result.plugins[cli].state, "known");
    assert.match(result.plugins[cli].reason, /configuration directory missing/);
    assert.equal(fs.existsSync(path.join(home, cli === "codex" ? ".codex" : ".claude")), false);
  }
});

test("Three real empty lists allow complete ECC and Impeccable installation", async (t) => {
  const home = installedHome(t);
  fs.mkdirSync(path.join(home, ".codex"));
  fs.mkdirSync(path.join(home, ".claude"));
  const project = path.join(home, "project");
  fs.mkdirSync(project);
  const outputs = {
    claude: "No plugins installed. Use \x60claude plugin install\x60 to install a plugin.\r\n",
    codex: "WARNING: The following directories are not on PATH: aliases\nNo marketplace plugins found.",
    agy: '{"plugins":[]}',
  };
  const clis = ["claude", "codex", "agy"].map((id) => ({ id, filePath: process.execPath, state: "ok" }));
  let query = 0;
  let detectionDone;
  const detect = ({ home: received }) => {
    query = 0;
    return (detectionDone = {
    node: { ok: true, version: "22.0.0", minimum: 22 }, git: { ok: true, version: "2.0.0" },
    gitleaks: { ok: false, error: "missing" }, clis,
    project: { inRepository: true, root: project, stacks: [] },
    installed: detectInstalled({ home: received, project, clis,
      executePlugins: () => ({ status: 0, stdout: outputs[["claude", "codex", "agy"][query++]] }) }),
    });
  };
  const thirdParty = { ...thirdPartyApi, fetchEcc(cache) {
    const ecc = path.join(cache, "ecc-2.2.3");
    for (const packageName of ["common", "web"]) {
      const directory = path.join(ecc, "rules", packageName);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "style.md"), `# ${packageName}\n`);
    }
    return ecc;
  } };
  let applied;
  const stdout = [];
  const args = ["--json", "--project", "--clis=none",
    "--ecc=claude,codex", "--impeccable=claude,codex,agy"];
  assert.equal(await main(["--dry-run", ...args], {
    home, cwd: project, detect, thirdParty, out: (line) => stdout.push(line), err: () => {},
  }), 0);
  const preview = JSON.parse(stdout.at(-1));
  assert.deepEqual(Object.fromEntries(Object.entries(preview.detection.installed.plugins)
    .map(([cli, uniqueList]) => [cli, [uniqueList.state, uniqueList.items.length]])), {
    claude: ["known", 0], codex: ["known", 0], agy: ["known", 0],
  });
  assert.equal(preview.summary.conflicts?.length ?? 0, 0);
  stdout.length = 0;
  const code = await main(["--yes", "--json", "--project", "--clis=none",
    "--ecc=claude,codex", "--impeccable=claude,codex,agy"], {
    home, cwd: project, detect, thirdParty, out: (line) => stdout.push(line), err: () => {},
    apply: async (actions) => {
      applied = actions;
      return { ok: true, dryRun: false, actions: [], conflicts: [], warnings: [], errors: [] };
    },
  });
  assert.equal(code, 0, stdout.join("\n"));
  const report = JSON.parse(stdout.at(-1));
  assert.deepEqual(Object.fromEntries(Object.entries(detectionDone.installed.plugins)
    .map(([cli, uniqueList]) => [cli, [uniqueList.state, uniqueList.items.length]])), {
    claude: ["known", 0], codex: ["known", 0], agy: ["known", 0],
  });
  const plannedThirdParty = report.summary.actions.filter((action) => ["ecc", "impeccable"].includes(action.owner));
  assert.ok(plannedThirdParty.length > 0);
  assert.ok(plannedThirdParty.every((action) => action.situation === "new"), JSON.stringify(plannedThirdParty));
  assert.ok(applied.some((action) => action.type === "command" && action.owner === "ecc"));
  assert.ok(applied.some((action) => action.type === "command" && action.owner === "impeccable"));
  assert.equal(report.conflicts.length, 0);
});

const syncedClaudePlugins = [
  'Synced from claude.ai:',
  '  ❯ brightdata-plugin@synced',
  '    Version: 1.9.0',
  '    Path: C:\\Users\\Leonn\\.claude\\plugins\\cache\\synced\\brightdata-plugin\\1.9.0',
  '    Status: ✓ loaded',
  '',
  '  ❯ cowork-plugin-management@synced',
  '    Version: 0.2.2',
  '    Path: C:\\Users\\Leonn\\.claude\\plugins\\cache\\synced\\cowork-plugin-management\\0.2.2',
  '    Status: ✓ loaded',
].join('\r\n');

test('Claude parses real synced plugin blocks with Windows paths and loaded status', () => {
  const expected = [
    ['brightdata-plugin@synced', '1.9.0', true],
    ['cowork-plugin-management@synced', '0.2.2', true],
  ];
  for (const header of ['Synced from claude.ai:', 'Installed plugins:', 'Other plugin section:']) {
    const items = parsePlugins('claude', syncedClaudePlugins.replace('Synced from claude.ai:', header));
    assert.deepEqual(items.map((item) => [item.name, item.version, item.installed]), expected);
    assert.ok(items.every((item) => item.status === 'loaded'));
  }
  assert.deepEqual(parsePlugins('claude', syncedClaudePlugins.replaceAll('❯', '→'))
    .map((item) => [item.name, item.version, item.installed]), expected);
  for (const status of ['✓ loaded', '✔ enabled', 'installed', 'disabled', 'plugin loaded', 'plugin enabled', 'plugin installed']) {
    assert.equal(parsePlugins('claude', 'Synced from claude.ai:\n  ❯ example@synced\n    Status: ' + status)[0].installed, true);
  }
  assert.equal(parsePlugins('claude', 'Synced from claude.ai:\n  ❯ example@synced\n    Status: not installed')[0].installed, false);
  assert.throws(() => parsePlugins('claude', 'Synced from claude.ai:\n???'), /Unrecognized plugin response format/);
});

test('Install dry-run in a fake home accepts synced Claude plugins without blocking ECC or Impeccable', async (t) => {
  const home = installedHome(t);
  fs.mkdirSync(path.join(home, '.claude'));
  const clis = [{ id: 'claude', filePath: process.execPath, state: 'ok' }];
  const stdout = [];
  let queries = 0;
  const code = await main(['install', '--dry-run', '--json', '--clis=claude', '--ecc=claude', '--impeccable=claude'], {
    home, cwd: home, isTTY: false, out: (line) => stdout.push(line), err: () => {},
    detect: ({ home: received }) => ({
      node: { ok: true, version: '22.0.0', minimum: 22 }, git: { ok: true, version: '2.0.0' },
      gitleaks: { ok: true, version: '8.0.0' }, clis,
      project: { inRepository: false, reason: 'outside a git repository', stacks: [] },
      installed: detectInstalled({ home: received, clis, executePlugins: (cmd, args) => {
        queries++;
        assert.deepEqual(args, ['plugin', 'list']);
        return { status: 0, stdout: syncedClaudePlugins };
      } }),
    }),
    thirdParty: { ...thirdPartyApi, fetchEcc: () => assert.fail('Dry-run must not download ECC') },
    apply: () => assert.fail('Dry-run must not apply'),
  });
  assert.equal(code, 0, stdout.join('\n'));
  assert.equal(queries, 1);
  const preview = JSON.parse(stdout[0]);
  assert.equal(preview.detection.installed.plugins.claude.state, 'known');
  assert.equal(preview.detection.installed.plugins.claude.items.length, 2);
  const thirdParty = preview.summary.actions.filter((action) => ['ecc', 'impeccable'].includes(action.owner));
  for (const owner of ['ecc', 'impeccable']) {
    assert.ok(thirdParty.some((action) => action.owner === owner && action.type === 'command'));
  }
  assert.ok(thirdParty.every((action) => action.situation === 'new'));
  assert.ok(preview.summary.actions.every((action) => action.situation !== 'conflict'));
  assert.deepEqual(fs.readdirSync(home), ['.claude']);
  assert.deepEqual(fs.readdirSync(path.join(home, '.claude')), []);
});

test("Claude reads installed sections and status; Claude and Antigravity JSON respects installed status", () => {
  const claude = parsePlugins("claude", "Installed plugins:\n"
    + "  ❯ ecc@ecc\n    Version: 2.2.3\n    Scope: user\n    Status: ✔ enabled\n"
    + "  ❯ other@local\n    Version: 1.0.0\n    Status: disabled\n");
  assert.deepEqual(claude.map((i) => [i.name, i.installed, i.version]),
    [["ecc@ecc", true, "2.2.3"], ["other@local", true, "1.0.0"]]);
  for (const cli of ["claude", "agy"]) {
    const items = parsePlugins(cli, JSON.stringify({ plugins: [
      { name: "ecc@ecc", installed: true, status: "disabled" },
      { name: "impeccable", installed: false, enabled: true },
      { name: "other", status: "installed, disabled" },
      { name: "catalog", status: "not installed" },
      { name: "record", enabled: false },
      { name: "without-status" },
    ] }));
    assert.deepEqual(items.map((i) => i.installed), [true, false, true, false, true, null]);
  }
});

test("Queries use fake-home CODEX_HOME and CLAUDE_CONFIG_DIR including a real fixture subprocess", (t) => {
  const home = installedHome(t);
  fs.mkdirSync(path.join(home, ".codex"));
  fs.mkdirSync(path.join(home, ".claude"));
  const previousCodex = process.env.CODEX_HOME;
  const previousClaude = process.env.CLAUDE_CONFIG_DIR;
  process.env.CODEX_HOME = path.join(home, "home-external", ".codex");
  process.env.CLAUDE_CONFIG_DIR = path.join(home, "home-external", ".claude");
  try {
    const code = 'const fs=require("node:fs"),p=require("node:path");'
      + 'for(const k of ["CODEX_HOME","CLAUDE_CONFIG_DIR"]){fs.mkdirSync(process.env[k],{recursive:true});'
      + 'fs.writeFileSync(p.join(process.env[k],"fixture.txt"),k)}'
      + 'console.log("ecc@ecc installed, enabled 2.2.3")';
    const result = detectInstalled({ home,
      clis: [{ id: "codex", filePath: path.join(home, "codex.exe"), state: "ok" }],
      executePlugins: (_cmd, _args, options) => spawnSync(process.execPath, ["-e", code], options) });
    assert.equal(result.plugins.codex.state, "known");
    assert.equal(fs.readFileSync(path.join(home, ".codex", "fixture.txt"), "utf8"), "CODEX_HOME");
    assert.equal(fs.readFileSync(path.join(home, ".claude", "fixture.txt"), "utf8"), "CLAUDE_CONFIG_DIR");
    assert.equal(fs.existsSync(path.join(home, "home-external")), false);
  } finally {
    if (previousCodex === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousCodex;
    if (previousClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previousClaude;
  }
});

test("Timeouts, failures, exceptions, invalid JSON and empty output never imply absence", (t) => {
  const home = installedHome(t);
  const clis = [{ id: "agy", filePath: path.join(home, "agy.exe"), state: "error" }];
  for (const answer of [
    { status: null, error: new Error("ETIMEDOUT") }, { status: 1, stdout: "[]" },
    { status: 0, stdout: "not JSON" }, { status: 0, stdout: "{}" }, { status: 0, stdout: "" },
  ]) {
    const plugins = detectInstalled({ home, clis, executePlugins: () => answer }).plugins;
    assert.equal(plugins.agy.state, "unknown");
    assert.equal(plugins.agy.items, null);
  }
  assert.equal(detectInstalled({ home, clis, executePlugins: () => { throw new Error("failure"); } })
    .plugins.agy.state, "unknown");
  assert.deepEqual(detectInstalled({ home, clis, executePlugins: () => ({ status: 0, stdout: "[]" }) })
    .plugins.agy.items, []);
});

test("Missing state writes nothing and invalid state never becomes an empty installation", (t) => {
  const home = installedHome(t);
  assert.deepEqual(detectInstalled({ home }).state.items, []);
  assert.deepEqual(fs.readdirSync(home), []);
  fs.mkdirSync(path.join(home, ".vibecoding-devtools"));
  fs.writeFileSync(path.join(home, ".vibecoding-devtools", "state.json"), "broken");
  assert.throws(() => detectInstalled({ home }));
  assert.throws(() => detectInstalled(), /home/);
});

test("Probing ignores only ENOENT and ENOTDIR; EACCES and EIO produce errors", (t) => {
  const home = installedHome(t);
  for (const code of ["ENOENT", "ENOTDIR", "EACCES", "EIO"]) {
    const mock = t.mock.method(fs, "statSync", () => { throw Object.assign(new Error(code), { code }); });
    const env = { PATH: path.join(home, "bin"), HOME: home };
    const cli = detectCli(CLI, { env, platform: "linux", home });
    const tool = checkTool("git", { env, platform: "linux" });
    if (["ENOENT", "ENOTDIR"].includes(code)) {
      assert.equal(findIn("cli", [home], { platform: "linux" }), null);
      assert.equal(cli.state, "missing");
    } else {
      assert.throws(() => findIn("cli", [home], { platform: "linux" }), { code });
      assert.equal(cli.state, "error");
      assert.equal(cli.install, undefined);
      assert.match(cli.error, new RegExp(code));
      assert.equal(tool.state, "error");
    }
    mock.mock.restore();
  }
});

test("Explicit home overrides environment variables in detectAll probes", (t) => {
  const home = installedHome(t);
  const other = path.join(home, "other-home");
  const queries = [];
  const mock = t.mock.method(fs, "statSync", (file) => {
    queries.push(file);
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  });
  const result = detectAll({ home, cwd: home, platform: "linux", env: { HOME: other, PATH: "" },
    executePlugins: () => assert.fail("Must not query plugins") });
  mock.mock.restore();
  for (const cli of ["claude", "codex", "agy"]) {
    assert.ok(queries.includes(path.join(home, ".local", "bin", cli)));
  }
  assert.ok(queries.every((file) => !file.startsWith(other)));
  assert.ok(result.clis.every((cli) => cli.state === "missing"));
});

test("Explicit home reaches --version subprocesses and Windows USERPROFILE paths", (t) => {
  const home = installedHome(t);
  const directory = path.join(home, ".local", "bin");
  const bin = "cli-home";
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, WIN ? `${bin}.cmd` : bin);
  fs.writeFileSync(file, WIN
    ? '@echo 1.2.3\r\n@echo %HOME%> "%HOME%\\home-received.txt"\r\n'
    : '#!/bin/sh\necho 1.2.3\nprintf "%s\\n" "$HOME" > "$HOME/home-received.txt"\n');
  if (!WIN) fs.chmodSync(file, 0o755);
  const cli = { ...CLI, bin, directories: { unix: ["~/.local/bin"], win: ["%USERPROFILE%/.local/bin"] } };
  const result = detectCli(cli, { home, env: { HOME: path.join(home, "wrong"),
    USERPROFILE: path.join(home, "wrong"), PATH: "", PATHEXT: ".CMD" } });
  assert.equal(result.state, "off-path");
  assert.equal(result.version, "1.2.3");
  assert.equal(fs.readFileSync(path.join(home, "home-received.txt"), "utf8").trim(), home);
});
