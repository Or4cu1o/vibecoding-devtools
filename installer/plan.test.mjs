import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan, gateguardExemptions } from "./plan.mjs";
import { hashContent } from "./state.mjs";

const kit = fileURLToPath(new URL("../", import.meta.url));
function environment(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-plan-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const paths = { home: path.join(temp, "home"), project: path.join(temp, "project"), kit,
    ecc: path.join(temp, "ecc") };
  for (const packageName of ["common", "web", "typescript"]) {
    const directory = path.join(paths.ecc, "rules", packageName);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "style.md"), `# ${packageName}\n[Common](../common/style.md)\n`);
  }
  return paths;
}
const choices = (extra = {}) => ({ clis: ["claude", "codex", "agy"], scope: "global", maestri: false, hooks: false,
  ecc: { clis: [], hooks: false, stacks: [] }, impeccable: { clis: [] }, ...extra });
const destination = (action) => action.destination.replace(/\\/g, "/");

test("Real global kit plans preserve destinations, content and metadata without writes", (t) => {
  const paths = environment(t);
  const options = choices();
  const before = structuredClone(options);
  const plan = buildPlan(options, {}, paths);
  assert.deepEqual(buildPlan(options, {}, paths), plan);
  assert.deepEqual(options, before);
  assert.equal(fs.existsSync(paths.home), false);
  assert.equal(fs.existsSync(paths.project), false);
  for (const action of plan) {
    assert.deepEqual(Object.keys(action).sort(),
      ["type", "owner", "cli", "source", "destination", "content", "description", "situation"].sort());
    assert.equal(action.situation, "new");
    assert.ok(["copy", "write", "block"].includes(action.type));
    assert.ok(action.destination.startsWith(paths.home + path.sep));
    if (action.source) assert.ok(fs.existsSync(action.source));
    assert.doesNotMatch(action.description, /maestri/i);
  }
  assert.ok(plan.some((a) => destination(a).endsWith("/.claude/rules/vibecoding/base.md")));
  assert.ok(plan.some((a) => destination(a).endsWith("/.agents/skills/security-surfaces")));
  assert.ok(plan.some((a) => destination(a).endsWith("/.gemini/config/skills/risk-triage")));
  const block = plan.find((a) => a.type === "block");
  assert.match(block.content, /# Base/);
  assert.match(block.content, /context-on-demand.md/);
  assert.doesNotMatch(block.content, /# Context on demand/);
  assert.ok(Buffer.byteLength(block.content) < 32 * 1024);
});

test("Maestri rules and skills are opt-in on all three CLIs", (t) => {
  const plan = buildPlan(choices({ maestri: true }), {}, environment(t));
  for (const cli of ["claude", "codex", "agy"]) {
    assert.equal(plan.filter((a) => a.cli === cli && a.description.startsWith("Kit skill")
      && /maestri-/.test(a.destination)).length, 3);
    assert.ok(plan.some((a) => a.cli === cli && /maestri-messaging|# Maestri messaging/
      .test(a.destination + a.content)));
  }
});

test("Maestri pack installs the Codex command rules in the global home, in either scope", (t) => {
  const paths = environment(t);
  const rules = (options) => buildPlan(options, {}, paths)
    .filter((a) => destination(a).endsWith("/.codex/rules/vibecoding-devtools-maestri.rules"));
  for (const scope of ["global", "project"]) {
    const [action] = rules(choices({ clis: ["codex"], maestri: true, scope }));
    assert.ok(action.destination.startsWith(paths.home + path.sep), scope);
    assert.equal(action.source, path.join(kit, "installer", "codex-maestri.rules"));
  }
  assert.equal(rules(choices({ clis: ["codex"] })).length, 0);
  assert.equal(rules(choices({ clis: ["claude", "agy"], maestri: true })).length, 0);
});

test("ECC on Claude exempts this machine's scratch, memory and Maestri trees from GateGuard in the user settings", (t) => {
  const paths = environment(t);
  const exemptions = (options) => buildPlan(choices({ clis: [], ...options }), {}, paths).filter((a) => a.type === "env-list");
  for (const scope of ["global", "project"]) {
    const [action] = exemptions({ scope, maestri: true, ecc: { clis: ["claude"], hooks: false, stacks: [] } });
    assert.equal(action.destination, path.join(paths.home, ".claude", "settings.json"), scope);
    assert.equal(action.key, "GATEGUARD_EXEMPT_GLOBS");
    assert.ok(action.values.includes(`${paths.home.replace(/\\/g, "/")}/.claude/projects/*/memory/**`));
    assert.ok(action.values.includes("**/.maestri/**"));
  }
  assert.equal(exemptions({ ecc: { clis: ["codex"], hooks: true, stacks: [] } }).length, 0);
  assert.equal(exemptions({ clis: ["claude"] }).length, 0);
});

test("GateGuard temp exemption follows CLAUDE_CODE_TMPDIR, the uid on Unix and no uid on Windows", () => {
  for (const [system, temp] of [
    [{ platform: "linux", uid: 1000, env: {} }, "/tmp/claude-1000/**"],
    [{ platform: "darwin", uid: 501, env: { CLAUDE_CODE_TMPDIR: "/private/tmp/" } }, "/private/tmp/claude-501/**"],
    [{ platform: "win32", uid: null, env: { CLAUDE_CODE_TMPDIR: "C:\\Temp" } }, "C:/Temp/claude/**"],
  ]) {
    assert.deepEqual(gateguardExemptions({ home: "/h", maestri: false, ...system }), [temp, "/h/.claude/projects/*/memory/**"]);
  }
  assert.deepEqual(gateguardExemptions({ home: "/h", platform: "linux", uid: null, env: {} }), ["/h/.claude/projects/*/memory/**"]);
});

test("Global ECC uses common and web on Claude and common on Codex without stack packages", (t) => {
  const paths = environment(t);
  const plan = buildPlan(choices({ clis: [], ecc: {
    clis: ["claude", "codex"], hooks: true, stacks: ["typescript"],
  } }), {}, paths);
  assert.equal(plan.filter((a) => a.cli === "claude" && a.owner === "ecc").length, 2);
  assert.ok(plan.some((a) => destination(a).endsWith("/.codex/vibecoding/ecc/common")));
  assert.ok(plan.every((a) => a.cli !== "agy"));
  assert.equal(plan.some((a) => /typescript/.test(a.destination + a.content)), false);
  const block = plan.find((a) => a.type === "block");
  assert.match(block.content, /common\/style.md/);
  assert.doesNotMatch(block.content, /# common/);
});

test("Project plans deduplicate templates and shared skills and preserve ECC paths", (t) => {
  const paths = environment(t);
  const options = choices({ scope: "project", ecc: {
    clis: ["claude", "codex"], hooks: false, stacks: ["typescript", "typescript"],
  } });
  const plan = buildPlan(options, {}, paths);
  assert.equal(plan.filter((a) => a.description === "Project template AGENTS.md").length, 1);
  assert.equal(plan.filter((a) => a.description === "Project template CLAUDE.md").length, 1);
  assert.equal(plan.filter((a) => destination(a).endsWith("/.agents/skills/risk-triage")).length, 1);
  assert.ok(plan.some((a) => destination(a).endsWith("/.claude/rules/ecc/typescript") && a.type === "copy"));
  assert.ok(plan.every((a) => a.owner !== "ecc" || a.cli !== "agy"));
  assert.match(plan.find((a) => a.type === "block").content, /stack typescript/);
  assert.equal(new Set(plan.map((a) => `${a.type}:${a.destination}`)).size, plan.length);
  // GateGuard exemptions hold this machine's paths, so they stay in the user settings.
  assert.ok(plan.every((a) => a.type === "env-list" || a.destination.startsWith(paths.project + path.sep)));
  assert.equal(fs.existsSync(paths.project), false);
});

test("Explicit selections override detection and third parties produce no commands", (t) => {
  const paths = environment(t);
  const options = choices({ clis: ["codex", "codex"], impeccable: { clis: ["claude"] } });
  const plan = buildPlan(options, { clis: [], project: { stacks: ["python"] } }, paths);
  assert.ok(plan.every((a) => a.cli === "codex" && a.owner === "kit"));
  assert.deepEqual(buildPlan(choices({ clis: [] }), {}, paths), []);
});

test("Incomplete inputs, traversal and unsupported ECC targets fail before execution", (t) => {
  const paths = environment(t);
  assert.throws(() => buildPlan(choices({ scope: "project" }), {}, { ...paths, project: null }), /project/);
  assert.throws(() => buildPlan(choices({ clis: ["invalid"] }), {}, paths), /Invalid CLI/);
  assert.throws(() => buildPlan(choices({ ecc: { clis: ["codex"] } }), {}, { ...paths, ecc: null }), /downloaded/);
  assert.throws(() => buildPlan(choices({ scope: "project", ecc: {
    clis: ["codex"], stacks: ["../outside"],
  } }), {}, paths), /Invalid ECC package/);
  const directory = path.join(paths.ecc, "rules", "new-stack");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "rule.md"), "# Rule");
  assert.throws(() => buildPlan(choices({ scope: "project", ecc: {
    clis: ["agy"], stacks: ["new-stack"],
  } }), {}, paths), /ECC is not supported on Antigravity/);
});

function store(destination, content) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

test("Classify new, identical, registered updates and local conflicts without writes", (t) => {
  const paths = environment(t);
  const options = choices({ clis: ["agy"] });
  const target = buildPlan(options, {}, paths).find((a) => a.destination.endsWith("vibecoding-base.md"));
  assert.equal(target.situation, "new");
  const situation = (detection = {}) => buildPlan(options, detection, paths)
    .find((a) => a.destination === target.destination).situation;
  store(target.destination, target.content);
  assert.equal(situation(), "same"); // Identical content, even if installed by another source.
  store(target.destination, "version old");
  assert.equal(situation(), "conflict");
  const state = { version: "0.0.1", items: [{ type: "write", owner: "kit", destination: target.destination,
    hash: hashContent("version old") }] };
  const detection = { installed: { state } };
  assert.equal(situation(detection), "update");
  store(path.join(paths.home, ".vibecoding-devtools", "state.json"), JSON.stringify(state));
  assert.equal(situation(), "update"); // Support callers that do not pass detection yet.
  store(target.destination, "edit local");
  assert.equal(situation(detection), "conflict");
  assert.equal(fs.readFileSync(target.destination, "utf8"), "edit local");
});

test("Tree copies check file bytes, individual records and partial conflicts", (t) => {
  const paths = environment(t);
  const options = choices({ clis: ["claude"] });
  const target = buildPlan(options, {}, paths).find((a) => a.description === "Kit skill: security-surfaces");
  fs.cpSync(target.source, target.destination, { recursive: true });
  const situation = (items = []) => buildPlan(options, { installed: { state: { items } } }, paths)
    .find((a) => a.destination === target.destination).situation;
  assert.equal(situation(), "same");
  const file = path.join(target.destination, "surfaces", "money.md");
  store(file, "old");
  assert.equal(situation(), "conflict");
  const items = [{ type: "copy", owner: "kit", destination: file, hash: hashContent("old") }];
  assert.equal(situation(items), "update");
  store(path.join(target.destination, "user.txt"), "preserve");
  assert.equal(situation(items), "conflict");
  assert.equal(fs.readFileSync(file, "utf8"), "old");
});

test("Blocks compare marked ranges, preserve external context and respect recorded hashes", (t) => {
  const paths = environment(t);
  const options = choices({ clis: ["codex"] });
  const target = buildPlan(options, {}, paths).find((a) => a.type === "block");
  const mark = (content) => `<!-- vibecoding-devtools:start -->\n${content}\n<!-- vibecoding-devtools:end -->`;
  const situation = (items = []) => buildPlan(options, { installed: { state: { items } } }, paths)
    .find((a) => a.type === "block").situation;
  store(target.destination, "# Instructions of user\n");
  assert.equal(situation(), "new");
  store(target.destination, `Antes\n${mark(target.content)}\nAfter`);
  assert.equal(situation(), "same");
  store(target.destination, `Antes\n${mark("previous")}\nAfter`);
  assert.equal(situation(), "conflict");
  const items = [{ type: "block", owner: "kit", destination: target.destination, hash: hashContent(mark("previous")) }];
  assert.equal(situation(items), "update");
  store(target.destination, `Antes\n${mark("modified locally")}\nAfter`);
  assert.equal(situation(items), "conflict");
  store(target.destination, "<!-- vibecoding-devtools:start -->\nwithout end");
  assert.equal(situation(items), "conflict");
});

test("AGENTS templates remain identical after Codex blocks and registered ECC updates", (t) => {
  const paths = environment(t);
  const options = choices({ scope: "project", clis: ["codex"], ecc: { clis: ["codex"], stacks: [] } });
  const plan = buildPlan(options, {}, paths);
  const template = plan.find((a) => a.description === "Project template AGENTS.md");
  const block = plan.find((a) => a.type === "block");
  store(template.destination, fs.readFileSync(template.source, "utf8")
    + `<!-- vibecoding-devtools:start -->\n${block.content}\n<!-- vibecoding-devtools:end -->`);
  const ecc = plan.find((a) => a.owner === "ecc");
  store(path.join(ecc.destination, "style.md"), "ECC previous");
  const items = [{ type: "copy", owner: "ecc", destination: path.join(ecc.destination, "style.md"),
    hash: hashContent("ECC previous") }];
  const updated = buildPlan(options, { installed: { state: { items } } }, paths);
  assert.equal(updated.find((a) => a.destination === template.destination && a.type === "copy").situation, "same");
  assert.equal(updated.find((a) => a.type === "block").situation, "same");
  assert.equal(updated.find((a) => a.destination === ecc.destination).situation, "update");
});

test("Missing ECC routing produces one update and then an identical Codex block", (t) => {
  const paths = environment(t);
  const old = choices({ clis: ["codex"], maestri: true });
  const replacement = choices({ clis: ["codex"], maestri: true,
    ecc: { clis: ["codex"], hooks: false, stacks: [] } });
  const previous = buildPlan(old, {}, paths).find((a) => a.type === "block");
  const marker = (content) => `<!-- vibecoding-devtools:start -->\n${content}\n<!-- vibecoding-devtools:end -->`;
  store(previous.destination, marker(previous.content));
  const item = { type: "block", owner: "kit", destination: previous.destination, hash: hashContent(marker(previous.content)) };
  const withEcc = buildPlan(replacement, { installed: { state: { items: [item] } } }, paths)
    .find((a) => a.type === "block");
  assert.equal(withEcc.situation, "update");
  assert.doesNotMatch(previous.content, /vibecoding\/ecc\/common/);
  assert.match(withEcc.content, /vibecoding\/ecc\/common/);

  store(withEcc.destination, marker(withEcc.content));
  item.hash = hashContent(marker(withEcc.content));
  const repeated = buildPlan(replacement, { installed: { state: { items: [item] } } }, paths)
    .find((a) => a.type === "block");
  assert.equal(repeated.situation, "same");
  assert.equal(repeated.content, withEcc.content);
});

test("Incompatible destinations and file ancestors produce conflicts", (t) => {
  const paths = environment(t);
  store(path.join(paths.home, ".claude"), "file of user");
  const plan = buildPlan(choices({ clis: ["claude"] }), {}, paths);
  assert.ok(plan.every((a) => a.situation === "conflict"));
  assert.equal(fs.readFileSync(path.join(paths.home, ".claude"), "utf8"), "file of user");
  const agy = buildPlan(choices({ clis: ["agy"] }), {}, paths)
    .find((a) => a.type === "write");
  fs.mkdirSync(agy.destination, { recursive: true });
  assert.equal(buildPlan(choices({ clis: ["agy"] }), {}, paths)
    .find((a) => a.destination === agy.destination).situation, "conflict");
});

const markCodex = (content) => `<!-- vibecoding-devtools:start -->\n${content}\n<!-- vibecoding-devtools:end -->`;

test("Codex budget combines global and project context and reduces ECC routing with warnings", (t) => {
  const paths = environment(t);
  for (let i = 0; i < 35; i++) store(path.join(paths.ecc, "rules", "common", `rule-${i}.md`), "# ECC");
  const options = choices({ clis: ["codex"], scope: "project", ecc: { clis: ["codex"], stacks: [] } });
  const normal = buildPlan(options, {}, paths).find((a) => a.type === "block");
  const global = "á".repeat(1000); // Budget is in bytes rather than characters.
  store(path.join(paths.home, ".codex", "AGENTS.md"), global);
  const bytesWithoutProject = Buffer.byteLength(global) + Buffer.byteLength(markCodex(normal.content));
  const project = "P".repeat(32768 - bytesWithoutProject - 1 + 16); // The separator before the replacement block is one byte.
  store(path.join(paths.project, "AGENTS.md"), project);
  const plan = buildPlan(options, {}, paths);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /32784 bytes.*32 KiB.*line per package/);
  const block = plan.find((a) => a.type === "block");
  assert.equal((block.content.match(/ECC package common/g) ?? []).length, 1);
  assert.doesNotMatch(block.content, /common\/rule-/);
  const total = Buffer.byteLength(global + project + "\n" + markCodex(block.content));
  assert.ok(total <= 32768);
  assert.equal(fs.readFileSync(path.join(paths.project, "AGENTS.md"), "utf8"), project);
});

test("Codex budget includes markers, accepts exactly 32 KiB and rejects overflow after compaction", (t) => {
  const paths = environment(t);
  const options = choices({ clis: ["codex"] });
  const block = buildPlan(options, {}, paths).find((a) => a.type === "block");
  const replacement = markCodex(block.content);
  const project = "P".repeat(1000);
  store(path.join(paths.project, "AGENTS.md"), project);
  const prefix = "G".repeat(32768 - Buffer.byteLength(replacement) - project.length - 1) + "\n";
  const global = path.join(paths.home, ".codex", "AGENTS.md");
  store(global, prefix + markCodex("old"));
  assert.equal(buildPlan(options, {}, paths).warnings, undefined);
  store(path.join(paths.project, "AGENTS.md"), project + "é");
  assert.throws(() => buildPlan(options, {}, paths), /32770 bytes.*32768-byte/);
  assert.equal(fs.readFileSync(global, "utf8"), prefix + markCodex("old"));
});

test("Codex budget considers uncopied templates and replaces old blocks", (t) => {
  const paths = environment(t);
  const options = choices({ clis: ["codex"], scope: "project" });
  const block = buildPlan(options, {}, paths).find((a) => a.type === "block");
  const global = path.join(paths.home, ".codex", "AGENTS.md");
  store(global, "G".repeat(32768 - Buffer.byteLength(markCodex(block.content)) - 100));
  assert.throws(() => buildPlan(options, {}, paths), /reduce AGENTS.md/);
  store(global, "Global\n");
  store(path.join(paths.project, "AGENTS.md"), "Project\n" + markCodex("x".repeat(40000)));
  assert.doesNotThrow(() => buildPlan(options, {}, paths));
});

test("Codex budget considers template updates before adding blocks", (t) => {
  const paths = environment(t);
  const options = choices({ clis: ["codex"], scope: "project" });
  const block = buildPlan(options, {}, paths).find((a) => a.type === "block");
  const agents = path.join(paths.project, "AGENTS.md");
  const base = "template old\n";
  const old = markCodex("block old");
  store(agents, base + old);
  store(path.join(paths.home, ".codex", "AGENTS.md"),
    "G".repeat(32768 - Buffer.byteLength(markCodex(block.content)) - 500));
  const state = { items: [
    { type: "copy", destination: agents, hash: hashContent(base) },
    { type: "block", destination: agents, hash: hashContent(old), separator: "" },
  ] };
  assert.throws(() => buildPlan(options, { installed: { state } }, paths), /32768-byte/);
});
