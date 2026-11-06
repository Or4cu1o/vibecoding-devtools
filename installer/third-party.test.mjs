import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { thirdPartyActions, detectThirdParty, fetchEcc, thirdParty } from "./third-party.mjs";

function environment(t, { codex = true } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-thirdParty-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const paths = { home: path.join(temp, "home"), project: path.join(temp, "project with spaces") };
  if (codex) fs.mkdirSync(path.join(paths.home, ".codex"), { recursive: true });
  return paths;
}
const choices = (extra = {}) => ({ scope: "global", ecc: { clis: [] }, impeccable: { clis: [] }, ...extra });
const store = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
};
const ecc = (clis, hooks = false, scope = "global") => choices({ scope, ecc: { clis, hooks } });
const detected = (extra = {}) => ({ plugins: Object.fromEntries(["claude", "codex", "agy"]
  .map((cli) => [cli, { state: "known", items: [] }])), ...extra });

test("Pin versions and modules without rules-core or default hooks", () => {
  assert.equal(thirdParty.ecc.version, "2.2.3");
  assert.equal(thirdParty.ecc.tag, "v2.2.3");
  assert.equal(thirdParty.ecc.repository, "https://github.com/affaan-m/ECC.git");
  assert.equal(thirdParty.impeccable.version, "4.8.0");
  assert.deepEqual(thirdParty.ecc.modules, ["agents-core", "commands-core", "platform-configs", "workflow-quality"]);
});

test("Pure Claude global and project plans preserve targets, cwd, opt-in hooks and uninstall", (t) => {
  const paths = environment(t, { codex: false });
  for (const scope of ["global", "project"]) for (const hooks of [false, true]) {
    const options = ecc(["claude", "claude"], hooks, scope);
    const before = structuredClone(options);
    const actions = thirdPartyActions(options, detected({ platform: "win32" }), paths);
    assert.equal(actions.length, 1);
    const a = actions[0];
    const target = scope === "global" ? "claude" : "claude-project";
    assert.equal(a.type, "command");
    assert.equal(a.owner, "ecc");
    assert.equal(a.cli, "claude");
    assert.equal(a.situation, "new");
    assert.equal(a.cmd, "npx.cmd");
    assert.deepEqual(a.args, ["-y", "ecc-universal@2.2.3", "install", "--target", target, "--modules",
      "agents-core,commands-core,platform-configs,workflow-quality" + (hooks ? ",hooks-runtime" : ""),
      hooks ? "--enable-hooks" : "--no-hooks"]);
    assert.deepEqual(a.uninstall, { cmd: "npx.cmd", args: ["-y", "ecc-universal@2.2.3", "uninstall", "--target", target],
      cwd: paths.project });
    assert.equal(a.cwd, paths.project);
    assert.deepEqual(options, before);
    assert.deepEqual(thirdPartyActions(options, detected({ platform: "win32" }), paths), actions);
  }
  assert.equal(fs.existsSync(paths.home), false);
  assert.equal(fs.existsSync(paths.project), false);
  assert.equal(thirdPartyActions(ecc(["claude"]), { platform: "linux" }, paths)[0].cmd, "npx");
});

test("Codex uses only plugins with a pinned marketplace and remove inverse", (t) => {
  const paths = environment(t);
  const cmd = path.join(paths.home, "bin", "codex.cmd");
  const actions = thirdPartyActions(ecc(["codex"], true), detected({ clis: [{ id: "codex", filePath: cmd }] }), paths);
  assert.deepEqual(actions.map((a) => a.args), [["plugin", "marketplace", "add", "affaan-m/ECC@v2.2.3"],
    ["plugin", "add", "ecc@ecc"]]);
  assert.ok(actions.every((a) => a.cmd === cmd));
  const env = { CODEX_HOME: path.join(paths.home, ".codex") };
  assert.ok(actions.every((a) => a.env.CODEX_HOME === env.CODEX_HOME));
  assert.deepEqual(actions[1].uninstall, { cmd, args: ["plugin", "remove", "ecc@ecc"], cwd: paths.project, env });
  assert.match(actions.warnings.join("\n"), /\/hooks/);
});

test("Missing .codex skips Codex commands with warnings while preserving other targets", (t) => {
  const paths = environment(t, { codex: false });
  const warning = "Open Codex once and run the installer again to install ECC on Codex.";
  for (const scope of ["global", "project"]) for (const platform of ["win32", "linux"]) {
    const codexOnly = thirdPartyActions(ecc(["codex"], true, scope), detected({ platform }), paths);
    assert.equal(codexOnly.length, 0);
    assert.deepEqual(codexOnly.warnings, [warning]);
    const mixed = thirdPartyActions(ecc(["claude", "codex"], false, scope), detected({ platform }), paths);
    assert.equal(mixed.length, 1);
    assert.equal(mixed[0].cli, "claude");
    assert.deepEqual(mixed.warnings, [warning]);
    assert.equal(fs.existsSync(paths.home), false);
  }
  fs.mkdirSync(paths.home);
  const existingHome = thirdPartyActions(ecc(["codex"]), detected(), paths);
  assert.equal(existingHome.length, 0);
  assert.deepEqual(existingHome.warnings, [warning]);
  assert.deepEqual(fs.readdirSync(paths.home), []);
});

test("ECC rejects Antigravity in both scopes before producing commands", (t) => {
  const paths = environment(t);
  for (const scope of ["global", "project"]) {
    assert.throws(() => thirdPartyActions(ecc(["agy"], true, scope), detected(), paths),
      /ECC is not supported on Antigravity/);
  }
});

test("Impeccable groups providers by scope with disabled telemetry and no invented uninstall", (t) => {
  const paths = environment(t);
  for (const scope of ["global", "project"]) for (const hooks of [undefined, false, true]) {
    const actions = thirdPartyActions(choices({ scope, impeccable: { clis: ["agy", "claude", "codex", "claude"], hooks } }),
      detected({ platform: "win32" }), paths);
    assert.equal(actions.length, 2);
    assert.deepEqual(actions[0].args, ["-y", "impeccable@4.8.0", "telemetry", "off"]);
    assert.deepEqual(actions[1].args, ["-y", "impeccable@4.8.0", "install", "--providers=claude,codex,antigravity",
      scope === "global" ? "--global" : "--project", "-y", ...(hooks === true ? [] : ["--no-hooks"])]);
    for (const a of actions) {
      assert.equal(a.cmd, "npx.cmd");
      assert.equal(a.cwd, scope === "global" ? paths.home : paths.project);
      assert.deepEqual(a.env, { DO_NOT_TRACK: "1" });
      assert.equal(a.uninstall, undefined);
      assert.match(a.warning, /does not support uninstalling/);
    }
    assert.match(actions.warnings.join("\n"), /manually check/);
  }
});

test("Detection reads only supplied homes and projects including local Claude state", (t) => {
  const paths = environment(t);
  assert.deepEqual(detectThirdParty(paths.home, paths.project), { ecc: [], warnings: [] });
  store(path.join(paths.home, ".claude", "ecc", "install-state.json"), { eccVersion: "2.2.3", version: 1 });
  store(path.join(paths.project, ".claude", "ecc", "install-state.json"), { version: "v2.1.0" });
  store(path.join(paths.project, ".agents", "ecc-install-state.json"), { schemaVersion: 2 });
  const detected = detectThirdParty(paths.home, paths.project);
  assert.deepEqual(detected.ecc.map(({ cli, scope, version }) => ({ cli, scope, version })), [
    { cli: "claude", scope: "global", version: "2.2.3" }, { cli: "claude", scope: "project", version: "2.1.0" },
  ]);
  const plugins = Object.fromEntries(["claude", "agy"].map((cli) => [cli, { state: "known", items: [] }]));
  const global = thirdPartyActions(ecc(["claude"]), { plugins, thirdParty: detected }, paths);
  assert.equal(global[0].situation, "same");
  const local = thirdPartyActions(ecc(["claude"], false, "project"), { installed: { plugins, thirdParty: detected } }, paths);
  assert.deepEqual(local.map((a) => a.situation), ["update"]);
  assert.deepEqual(local.warnings, []);
  assert.equal(detectThirdParty(paths.home).ecc.length, 1);
});

test("Corrupt install-state never causes a second installation; missing state remains new", (t) => {
  const paths = environment(t);
  store(path.join(paths.home, ".claude", "ecc", "install-state.json"), "{Invalid");
  const actions = thirdPartyActions(ecc(["claude", "codex"]), detected(), paths);
  assert.equal(actions[0].situation, "conflict");
  assert.match(actions.warnings.join("\n"), /Invalid install-state/);
  assert.ok(actions.slice(1).every((a) => a.situation === "new"));
});

test("Installed plugins preserve their channel and report versions, including outdated releases", (t) => {
  const paths = environment(t);
  for (const version of ["2.2.3", "2.0.0", "2.3.0", undefined]) {
    const detection = { installed: { plugins: {
      claude: { state: "known", items: [{ name: "ecc@ecc", version: "2.0.0", installed: true }] },
      codex: { state: "known", items: [{ name: "ecc@ecc", version, installed: true }] },
    } } };
    const actions = thirdPartyActions(ecc(["claude", "codex"]), detection, paths);
    assert.deepEqual(actions.map((a) => a.situation), ["same", "same"]);
    assert.ok(actions.every((a) => a.type === "summary" && a.method === "plugin"));
    assert.equal(actions[1].version, version ?? null);
    assert.equal(actions.warnings.some((w) => /ecc in codex is outdated/.test(w)), version === "2.0.0");
    assert.match(actions.warnings.join("\n"), /active method preserved/);
  }
  const npx = thirdPartyActions(ecc(["codex"]), detected({ thirdParty: { ecc: [
    { cli: "codex", scope: "global", method: "npx", version: "2.0.0" },
  ] } }), paths);
  assert.ok(npx.every((a) => a.situation === "same"));
  assert.match(npx.warnings.join("\n"), /through npx/);
  assert.equal(thirdPartyActions(ecc(["claude"]), { plugins: { claude: [{ name: "eccentric-tool", installed: true }] } }, paths)[0].situation, "new");
});

test("Impeccable never reinstalls plugins alongside new providers", (t) => {
  const actions = thirdPartyActions(choices({ impeccable: { clis: ["claude", "codex"] } }),
    { installed: { plugins: { claude: { state: "known", items: [{ id: "impeccable", installed: true }] },
      codex: { state: "known", items: [] } } } }, environment(t));
  const installs = actions.filter((a) => a.args?.includes("install"));
  assert.deepEqual(installs.map((a) => [a.args[3], a.situation]), [["--providers=codex", "new"]]);
  assert.equal(actions.find((a) => a.cli === "claude").type, "summary");
});

test("Claude user plugins satisfy global and project requests without commands or telemetry", (t) => {
  const paths = environment(t);
  for (const scope of ['global', 'project']) {
    const actions = thirdPartyActions(choices({ scope, ecc: { clis: ['claude'] },
      impeccable: { clis: ['claude', 'agy'] } }), { plugins: {
      claude: { state: 'known', items: [
        { name: 'ecc@ecc', scope: 'user', installed: true, version: '2.2.3' },
        { name: 'impeccable@impeccable', scope: 'user', installed: true, version: '4.7.1' },
      ] }, agy: { state: 'known', items: [] },
    } }, paths);
    const summaries = actions.filter((a) => a.type === 'summary');
    assert.deepEqual(summaries.map((a) => [a.owner, a.version]), [['ecc', '2.2.3'], ['impeccable', '4.7.1']]);
    assert.ok(actions.filter((a) => a.type === 'command').every((a) => a.cli === 'agy'));
    assert.equal(actions.find((a) => a.args?.includes('install')).args[3], '--providers=antigravity');
    assert.match(actions.warnings.join('\n'), /outdated: installed plugin 4.7.1, kit pins 4.8.0/);
  }
  const actions = thirdPartyActions(choices({ impeccable: { clis: ['claude'] } }), {
    plugins: { claude: { state: 'known', items: [
      { name: 'impeccable@impeccable', scope: 'user', installed: true, version: '4.8.0' },
    ] } },
  }, paths);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'summary');
  assert.doesNotMatch(actions.warnings.join('\n'), /outdated|uninstalling/);
});

test("Impeccable installs only providers without its skill and remains identical after group changes", (t) => {
  const paths = environment(t);
  for (const scope of ["global", "project"]) {
    const root = scope === "global" ? paths.home : paths.project;
    const locations = { claude: ".claude", codex: ".agents", agy: scope === "global" ? ".gemini/config" : ".agents" };
    const options = choices({ scope, impeccable: { clis: ["claude", "codex", "agy"] } });
    store(path.join(root, locations.claude, "skills/impeccable/SKILL.md"), "Claude installed before");
    if (scope === "global") store(path.join(root, locations.agy, "skills/impeccable/SKILL.md"), "Antigravity installed before");
    const before = fs.readFileSync(path.join(root, locations.claude, "skills/impeccable/SKILL.md"), "utf8");
    const partial = thirdPartyActions(options, detected(), paths);
    const installs = partial.filter((a) => a.args.includes("install"));
    assert.equal(installs.length, 1);
    assert.equal(installs[0].args[3], scope === "global" ? "--providers=codex" : "--providers=codex,antigravity");
    assert.equal(installs[0].situation, "new");
    store(path.join(root, locations.codex, "skills/impeccable/SKILL.md"), "Remaining installed");
    // Codex and Antigravity share project .agents/skills.
    const complete = thirdPartyActions(options, detected(), paths);
    assert.equal(complete.length, 2);
    assert.ok(complete.every((a) => a.situation === "same"));
    const smallerGroup = thirdPartyActions(choices({ scope, impeccable: { clis: ["claude", "agy"] } }), detected(), paths);
    assert.ok(smallerGroup.every((a) => a.situation === "same"));
    assert.equal(fs.readFileSync(path.join(root, locations.claude, "skills/impeccable/SKILL.md"), "utf8"), before);
  }
});

test("Impeccable skill presence respects scope and CLI and requires SKILL.md", (t) => {
  for (const scope of ["global", "project"]) for (const cli of ["claude", "codex", "agy"]) {
    const paths = environment(t);
    const base = cli === "claude" ? ".claude" : cli === "codex" || scope === "project" ? ".agents" : ".gemini/config";
    const otherRoot = scope === "global" ? paths.project : paths.home;
    store(path.join(otherRoot, base, "skills/impeccable/SKILL.md"), "Other scope");
    const skill = path.join(scope === "global" ? paths.home : paths.project, base, "skills/impeccable/SKILL.md");
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    const options = choices({ scope, impeccable: { clis: [cli] } });
    assert.equal(thirdPartyActions(options, detected(), paths).find((a) => a.args.includes("install")).situation, "new");
    store(skill, "Installed");
    // Direct skill presence prevents duplicate installation without requiring a plugin query.
    assert.ok(thirdPartyActions(options, {}, paths).every((a) => a.situation === "same"));
  }
  const paths = environment(t);
  store(path.join(paths.project, ".agent/skills/impeccable/SKILL.md"), "Project Impeccable adapter");
  assert.ok(thirdPartyActions(choices({ scope: "project", impeccable: { clis: ["agy"] } }), {}, paths)
    .every((a) => a.situation === "same"));
});

test("Empty selections and invalid inputs fail before commands", (t) => {
  const paths = environment(t);
  assert.equal(thirdPartyActions(choices(), {}, paths).length, 0);
  assert.throws(() => thirdPartyActions(choices(), {}, {}), /home/);
  assert.throws(() => thirdPartyActions(choices({ scope: "other" }), {}, paths), /scope/);
  assert.throws(() => thirdPartyActions(ecc(["claude"], false, "project"), {}, { home: paths.home }), /project/);
  assert.throws(() => thirdPartyActions(ecc(["unknown"]), {}, paths), /Invalid CLI/);
  assert.throws(() => thirdPartyActions(choices({ scope: "project", impeccable: { clis: ["claude"] } }), {}, { home: paths.home }), /project/);
});

test("Unknown, absent or malformed plugin lists block installation with or without install-state", (t) => {
  const paths = environment(t);
  for (const cli of ["claude", "codex", "agy"]) for (const uniqueList of [
    undefined, { state: "unknown", items: null, error: "plugin list failed" },
    { state: "unknown", items: [] }, { state: "known", items: null }, { items: [] },
  ]) for (const owner of ["ecc", "impeccable"]) for (const withState of [false, true]) {
    if (owner === "ecc" && cli === "agy") continue;
    const options = choices({ scope: "project", [owner]: { clis: [cli] } });
    const detection = { installed: { plugins: { [cli]: uniqueList }, thirdParty: {
      [owner]: withState ? [{ cli, scope: "project", method: "npx", version: "2.0.0" }] : [],
    } } };
    const actions = thirdPartyActions(options, detection, paths);
    const installs = actions.filter((a) => !a.args.includes("telemetry"));
    assert.ok(installs.length > 0);
    assert.ok(installs.every((a) => a.situation === "conflict"));
    assert.match(actions.warnings.join("\n"), /Could not confirm whether (ECC|Impeccable) is already installed as a plugin/);
    assert.equal(detection.installed.plugins[cli], uniqueList);
  }
});

test("Only known lists without the plugin permit new installation", (t) => {
  const paths = environment(t);
  for (const cli of ["claude", "codex", "agy"]) for (const owner of ["ecc", "impeccable"]) {
    if (owner === "ecc" && cli === "agy") continue;
    const actions = thirdPartyActions(choices({ scope: "project", [owner]: { clis: [cli] } }),
      { installed: { plugins: { [cli]: { state: "known", items: [{ name: "other-plugin", installed: true }] } } } }, paths);
    assert.ok(actions.every((a) => a.situation === "new"));
    assert.doesNotMatch(actions.warnings.join("\n"), /Could not confirm/);
  }
});

test("Uninstalled catalog plugins never block; only boolean installed status proves presence or absence", (t) => {
  const paths = environment(t);
  for (const owner of ["ecc", "impeccable"]) for (const cli of ["claude", "codex", "agy"]) {
    for (const [installed, expected] of [[false, "new"], [true, "same"], [undefined, "conflict"],
      [null, "conflict"], ["false", "conflict"]]) {
      const item = { name: owner === "ecc" ? "ecc@ecc" : "impeccable", installed,
        status: "not installed", version: thirdParty[owner].version };
      if (installed === undefined) delete item.installed;
      if (owner === "ecc" && cli === "agy") continue;
      const actions = thirdPartyActions(choices({ scope: "project", [owner]: { clis: [cli] } }),
        { installed: { plugins: { [cli]: { state: "known", items: [item] } } } }, paths);
      assert.ok(actions.filter((a) => !a.args?.includes("telemetry")).every((a) => a.situation === expected));
      if (expected === "conflict") assert.match(actions.warnings.join("\n"), /Could not confirm/);
      else assert.doesNotMatch(actions.warnings.join("\n"), /Could not confirm/);
    }
  }
  const legacy = thirdPartyActions(ecc(["codex"]), { plugins: { codex: ["ecc@ecc 2.2.3 not installed"] } }, paths);
  assert.ok(legacy.every((a) => a.situation === "conflict"));
});

test("Command and inverse CODEX_HOME use the selected home in either scope", (t) => {
  const paths = environment(t);
  for (const scope of ["global", "project"]) for (const platform of ["win32", "linux"]) {
    const actions = thirdPartyActions(ecc(["codex"], false, scope), detected({ platform }), paths);
    const env = { CODEX_HOME: path.join(paths.home, ".codex") };
    assert.deepEqual(actions.map((a) => a.env), [env, env]);
    assert.deepEqual(actions[1].uninstall.env, env);
    assert.deepEqual(fs.readdirSync(paths.home), [".codex"]);
    assert.deepEqual(fs.readdirSync(path.join(paths.home, ".codex")), []);
  }
});

test("Global Impeccable without a project uses home without creating directories", (t) => {
  const { home } = environment(t, { codex: false });
  const actions = thirdPartyActions(choices({ impeccable: { clis: ["claude", "codex"] } }), detected(), { home });
  assert.equal(actions.length, 2);
  assert.ok(actions.every((a) => a.cwd === home && a.situation === "new"));
  assert.ok(actions[1].args.includes("--global"));
  assert.equal(fs.existsSync(home), false);
});

test("fetchEcc clones only the pinned tag into isolated cache and reuses valid cache with fake git", (t) => {
  const { home } = environment(t);
  const cache = path.join(home, ".vibecoding-devtools", "cache");
  const destination = path.join(cache, "ecc-2.2.3");
  const calls = [];
  const execute = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    if (args[0] === "clone") fs.mkdirSync(path.join(destination, "rules"), { recursive: true });
    return { status: 0, stdout: "v2.2.3\n" };
  };
  assert.equal(fetchEcc(cache, { execute }), destination);
  assert.equal(calls[0].cmd, "git");
  assert.deepEqual(calls[0].args, ["clone", "--depth", "1", "--branch", "v2.2.3", "https://github.com/affaan-m/ECC.git", destination]);
  assert.equal(calls[0].options.cwd, cache);
  assert.equal(calls[0].options.shell, false);
  assert.equal(fetchEcc(cache, { execute }), destination);
  assert.deepEqual(calls[1].args, ["describe", "--tags", "--exact-match", "HEAD"]);
  assert.throws(() => fetchEcc(cache, { execute: () => ({ status: 0, stdout: "v2.0.0" }) }), /Invalid ECC cache/);
});

test("fetchEcc propagates clone errors without claiming success or deleting user cache", (t) => {
  const { home } = environment(t);
  const cache = path.join(home, "cache");
  assert.throws(() => fetchEcc(cache, { execute: () => ({ status: 1, stderr: "offline" }) }), /offline/);
  assert.throws(() => fetchEcc(cache, { execute: () => ({ error: new Error("without git") }) }), /without git/);
  assert.throws(() => fetchEcc(null), /cacheDir/);
  assert.equal(fs.existsSync(cache), true);
});
