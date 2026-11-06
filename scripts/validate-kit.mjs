#!/usr/bin/env node
// Validate skill and rule frontmatter, references, relative links and CHANGELOG.
// Run from the repository root; exit with code 1 on validation errors.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const error = (file, msg) => errors.push(`${file}: ${msg}`);

// Skills supplied by Maestri or bundled with CLIs rather than this kit.
const EXTERNAL = new Set(["maestri", "maestri-manager", "agy-customizations", "review-agent"]);

function listMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === ".git" || e.name === "node_modules") return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listMarkdown(p);
    return e.name.endsWith(".md") ? [p] : [];
  });
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split("\n")) {
    const c = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (c) fields[c[1]] = c[2];
    else if (/^\S/.test(line)) fields[`?${line}`] = "";
  }
  return fields;
}

// Normalize BOM and Windows line endings.
const read = (p) => fs.readFileSync(p, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const exists = (...p) => fs.existsSync(path.join(root, ...p));

// Skills require SKILL.md, a matching directory name and a single-line description.
for (const name of fs.readdirSync(path.join(root, "skills"))) {
  const file = path.join(root, "skills", name, "SKILL.md");
  if (!fs.existsSync(file)) { error(`skills/${name}`, "missing SKILL.md"); continue; }
  const fm = frontmatter(read(file));
  if (!fm) { error(rel(file), "missing frontmatter"); continue; }
  if (fm.name !== name) error(rel(file), `name "${fm.name ?? ""}" differs from directory "${name}"`);
  if (!fm.description || /^[|>]/.test(fm.description)) error(rel(file), "description is empty or multiline");
  else if (fm.description.length > 1024) error(rel(file), "description exceeds 1024 characters");
  for (const k of Object.keys(fm)) if (k.startsWith("?")) error(rel(file), `invalid frontmatter line: ${k.slice(1)}`);
}

// Claude Code rules support only the paths frontmatter field.
for (const file of listMarkdown(path.join(root, "rules"))) {
  const fm = frontmatter(read(file));
  for (const k of Object.keys(fm ?? {})) if (k !== "paths") error(rel(file), `unsupported frontmatter field: ${k}`);
}

// Check references and links throughout Markdown files.
for (const file of listMarkdown(root)) {
  const text = read(file).replace(/^(```|~~~)[\s\S]*?^\1/gm, "");

  // Recognize rule `x`, skill `x`, the `x` rule and the `x` skill.
  const references = [
    ...[...text.matchAll(/\b(rules?|skills?)\s+`([a-z0-9-]+)`/g)].map(([, type, name]) => [type, name]),
    ...[...text.matchAll(/`([a-z0-9-]+)`\s+(skill|rule)s?\b/g)].map(([, name, type]) => [type, name]),
  ];
  for (const [type, name] of references) {
    const ok = /^rule/.test(type) ? exists("rules", `${name}.md`) : exists("skills", name) || EXTERNAL.has(name);
    if (!ok) error(rel(file), `${type} \`${name}\` does not exist in the kit`);
  }
  const surfaces = [
    ...[...text.matchAll(/(?:\bsurface\s+`|\bsurfaces\/)([a-z0-9-]+)/g)].map(([, name]) => name),
    ...[...text.matchAll(/`([a-z0-9-]+)`\s+surface\b/g)].map(([, name]) => name),
  ];
  for (const name of surfaces) {
    if (!exists("skills", "security-surfaces", "surfaces", `${name}.md`)) error(rel(file), `surface \`${name}\` does not exist`);
  }
  for (const [, target] of text.replace(/`[^`\n]*`/g, "").matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const destination = path.resolve(path.dirname(file), target.split("#")[0]);
    if (!fs.existsSync(destination)) error(rel(file), `broken link: ${target}`);
  }
}

if (!/^## \[Unreleased\]$/m.test(read(path.join(root, "CHANGELOG.md")))) {
  error("CHANGELOG.md", "missing ## [Unreleased] section");
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log("Kit valid.");
