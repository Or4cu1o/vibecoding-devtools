import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFrontmatter, convertAntigravityRule, buildCodexBlock } from "./convert.mjs";

test("Frontmatter preserves BOM, CRLF, lists, quotes, braces and body", () => {
  const text = '\uFEFF---\r\npaths:\r\n  - "src/**/*.{ts,tsx}"\r\n  - \'docs/**\'\r\n---\r\n# Body\r\n';
  assert.deepEqual(readFrontmatter(text), { paths: ["src/**/*.{ts,tsx}", "docs/**"], body: "# Body\n" });
  assert.deepEqual(readFrontmatter('---\npaths: ["**/*.ts", \'**/*.tsx\']\n---\nX').paths,
    ["**/*.ts", "**/*.tsx"]);
  assert.deepEqual(readFrontmatter('---\npaths: "src/**"\n---\nX').paths, ["src/**"]);
  assert.deepEqual(readFrontmatter("# Without frontmatter"), { paths: [], body: "# Without frontmatter" });
  assert.deepEqual(readFrontmatter("---\npaths: []\n---\nX").paths, []);
  assert.throws(() => readFrontmatter("---\npaths: [x\n---\nX"), /Invalid/);
  assert.throws(() => readFrontmatter("---\npaths: x"), /Unclosed/);
});

test("Antigravity receives a trigger and quoted globs while preserving the body", () => {
  assert.equal(convertAntigravityRule("# Rule\n"), "---\ntrigger: always_on\n---\n# Rule\n");
  assert.equal(convertAntigravityRule('---\npaths: ["**/*.ts", "**/*.tsx"]\n---\nX'),
    '---\ntrigger: glob\nglobs: "**/*.ts, **/*.tsx"\n---\nX');
  assert.match(convertAntigravityRule("X", ["**/*.py"]), /trigger: glob\nglobs: "\*\*\/\*\.py"/);
});

test("Codex includes active rules and routes paths and ECC without on-demand bodies", () => {
  const block = buildCodexBlock([
    { name: "base", content: "# Base\nAlways." },
    { name: "ts", content: '---\npaths: ["**/*.ts"]\n---\nBODY RESTRICTED', destination: "rules/ts.md" },
    { name: "common", content: "BODY ECC", destination: "ecc/common.md", owner: "ecc" },
  ]);
  assert.match(block, /# Base\nAlways\./);
  assert.match(block, /files "\*\*\/\*\.ts".*`rules\/ts.md`/);
  assert.match(block, /ECC package common.*`ecc\/common.md`/);
  assert.doesNotMatch(block, /BODY RESTRICTED|BODY ECC|paths:/);
  assert.throws(() => buildCodexBlock([{ name: "x", content: "X", owner: "ecc" }]), /without destination/);
});


// Parse the emitted YAML subset: plain scalars and JSON strings.
function parseGeneratedYaml(text) {
  const header = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  assert.ok(header);
  return Object.fromEntries(header.split("\n").map((line) => {
    const m = line.match(/^([a-z_]+): (.+)$/);
    assert.ok(m, `Invalid YAML entry: ${line}`);
    if (m[2].startsWith('"')) return [m[1], JSON.parse(m[2])];
    assert.match(m[2], /^[a-z_]+$/);
    return [m[1], m[2]];
  }));
}

test("Antigravity frontmatter is valid YAML with multiple globs in one scalar", () => {
  const text = fs.readFileSync(new URL("../rules/context-on-demand.md", import.meta.url), "utf8");
  const converted = parseGeneratedYaml(convertAntigravityRule(text));
  assert.equal(converted.trigger, "glob");
  assert.equal(converted.globs, readFrontmatter(text).paths.join(", "));
  assert.deepEqual(parseGeneratedYaml(convertAntigravityRule("X")), { trigger: "always_on" });
  assert.throws(() => parseGeneratedYaml('---\ntrigger: glob\nglobs: "a", "b"\n---\nX'));
  assert.equal(parseGeneratedYaml(convertAntigravityRule("X", ['a"b', "**/*.{ts,tsx}"])).globs,
    'a"b, **/*.{ts,tsx}');
});



test("Convert the actual context-on-demand kit rule", () => {
  const text = fs.readFileSync(new URL("../rules/context-on-demand.md", import.meta.url), "utf8");
  assert.ok(readFrontmatter(text).paths.includes("**/AGENTS.md"));
  const converted = convertAntigravityRule(text);
  assert.match(converted, /trigger: glob/);
  assert.match(converted, /# Context on demand/);
  assert.doesNotMatch(converted, /^paths:/m);
});
