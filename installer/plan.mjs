// Read-only planning performs no writes, network calls, execution or real-home access.
import fs from "node:fs";
import path from "node:path";
import { isUtf8 } from "node:buffer";
import { readState, hashContent } from "./state.mjs";
import { convertAntigravityRule, readFrontmatter, buildCodexBlock } from "./convert.mjs";
import { hookActions } from './hooks.mjs';
import { jsonMergeSituation } from './json-merge.mjs';

const CLIS = ["claude", "codex", "agy"];
const uniqueList = (items = []) => [...new Set(items)].sort();
const entries = (directory) => fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const readRules = (directory) => entries(directory).filter((e) => e.isFile() && e.name.endsWith(".md"))
  .map((e) => ({ name: e.name, source: path.join(directory, e.name),
    content: fs.readFileSync(path.join(directory, e.name), "utf8") }));

const START = "<!-- vibecoding-devtools:start -->";
const END = "<!-- vibecoding-devtools:end -->";
const stat = (file) => {
  try { return fs.lstatSync(file); }
  catch (error) { if (["ENOENT", "ENOTDIR"].includes(error.code)) return null; throw error; }
};
const samePath = (a, b) => typeof a === "string" && path.resolve(a) === path.resolve(b);

function extractBlock(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start || text.indexOf(START, start + START.length) >= 0
    || text.indexOf(END, end + END.length) >= 0) return { invalid: true };
  return { content: text.slice(start, end + END.length), start, end: end + END.length };
}

// Measure complete resulting files including markers, separators and preserved external content.
function codexBytes(actions, home, project, items) {
  const files = new Set([path.join(home, ".codex", "AGENTS.md")]);
  if (project) files.add(path.join(project, "AGENTS.md"));
  let bytes = 0;
  for (const file of files) {
    const copied = actions.find((a) => a.type === "copy" && samePath(a.destination, file));
    let text = stat(file) ? fs.readFileSync(file, "utf8") : "";
    if (copied && ["new", "update"].includes(situationOf(copied, items))) {
      const previous = extractBlock(text);
      const record = items.find((i) => i.type === "block" && samePath(i.destination, file));
      text = fs.readFileSync(copied.source, "utf8");
      if (previous && !previous.invalid && record && hashContent(previous.content) === record.hash) {
        text += (record.separator ?? "") + previous.content;
      }
    }
    const action = actions.find((a) => a.type === "block" && samePath(a.destination, file));
    if (action) {
      const block = extractBlock(text);
      const replacement = `${START}\n${action.content}\n${END}`;
      text = block && !block.invalid ? text.slice(0, block.start) + replacement + text.slice(block.end)
        : text + (text && !text.endsWith("\n") ? "\n" : "") + replacement;
    }
    bytes += Buffer.byteLength(text);
  }
  return bytes;
}

function situationOf(action, items) {
  // Destination links and linked ancestors are conflicts and never escape the target tree.
  for (let p = path.resolve(action.destination); ; p = path.dirname(p)) {
    const ancestor = stat(p);
    if (ancestor?.isSymbolicLink()
      || (p !== path.resolve(action.destination) && ancestor && !ancestor.isDirectory())) return "conflict";
    if (p === path.dirname(p)) break;
  }
  const st = stat(action.destination);
  if (!st) return "new";
  if (action.type === "copy" && fs.lstatSync(action.source).isDirectory()) {
    if (!st.isDirectory()) return "conflict";
    const names = entries(action.source).map((e) => e.name);
    // Extra content survives copying, so the complete directory cannot be classified as identical.
    if (entries(action.destination).some((e) => !names.includes(e.name))) return "conflict";
    const situations = names.map((name) => situationOf({ ...action,
      source: path.join(action.source, name), destination: path.join(action.destination, name) }, items));
    return ["conflict", "update", "new"].find((s) => situations.includes(s)) ?? "same";
  }
  if (!st.isFile()) return "conflict";
  const current = fs.readFileSync(action.destination);
  let previous = items.find((item) => item.type === action.type && samePath(item.destination, action.destination));
  if (previous?.pending && previous.hashBefore === hashContent(current)) previous = previous.previous;
  if (action.type === 'json-merge') return jsonMergeSituation(current, action, previous);
  if (action.type === "block") {
    if (!isUtf8(current)) return "conflict";
    const block = extractBlock(current.toString("utf8"));
    if (!block) return "new"; // Adding a block preserves external AGENTS.md content.
    if (block.invalid) return "conflict";
    const replacement = `${START}\n${action.content}\n${END}`;
    if (block.content === replacement) return "same";
    return previous?.type === "block" && previous.hash === hashContent(block.content)
      ? "update" : "conflict";
  }
  const expected = action.type === "copy" ? fs.readFileSync(action.source) : Buffer.from(action.content);
  if (current.equals(expected)) return "same";
  // Project templates may already contain a Codex block from the initial installation.
  let base = current;
  if (action.description === "Project template AGENTS.md") {
    const text = current.toString("utf8");
    const block = extractBlock(text);
    if (block && !block.invalid) {
      const record = items.find((i) => i.type === "block" && samePath(i.destination, action.destination));
      let start = block.start;
      if (record?.separator && text.slice(start - record.separator.length, start) === record.separator) {
        start -= record.separator.length;
      }
      const withoutBlock = Buffer.from(text.slice(0, start) + text.slice(block.end));
      if (withoutBlock.equals(expected)) return "same";
      if (record && hashContent(block.content) === record.hash) base = withoutBlock;
    }
  }
  return previous && !previous.pending && previous.hash === hashContent(base)
    ? "update" : "conflict";
}

// Directory copies are recorded per file. Compare their current source tree, not
// just the directory destination, so removed children also leave the installation.
export function reconcileUpdate(plan, { home }) {
  const state = readState({ home });
  const actions = [];
  const expand = (action) => {
    if (action.owner === 'kit' && action.type === 'copy' && fs.lstatSync(action.source).isDirectory()) {
      const children = entries(action.source);
      if (!children.length) actions.push({ ...action, situation: situationOf(action, state.items) });
      for (const child of children) expand({ ...action, source: path.join(action.source, child.name),
        destination: path.join(action.destination, child.name) });
    } else actions.push(action.owner === 'kit' && action.destination
      ? { ...action, situation: situationOf(action, state.items) } : action);
  };
  for (const action of plan) expand(action);
  const key = (item) => JSON.stringify([item.type, path.resolve(item.destination),
    item.type === 'block' ? item.marker ?? START : null]);
  const wanted = new Set(actions.filter((a) => a.destination).map(key));
  const removals = state.items.filter((item) => item.owner === 'kit'
    && ['copy', 'write', 'block', 'json-merge'].includes(item.type) && !wanted.has(key(item)))
    .map((item) => ({ ...item, operation: 'remove', situation: 'remove' }));
  return Object.assign([...removals, ...actions], { warnings: plan.warnings, preparation: plan.preparation });
}

export function buildPlan(choices, detection, paths) {
  const { home, kit, ecc, project } = paths;
  if (!home || !kit) throw new Error("paths.home and paths.kit are required");
  const state = detection?.installed?.state ?? readState({ home });
  if (!["global", "project"].includes(choices.scope)) throw new Error("Invalid scope");
  const local = choices.scope === "project";
  if (local && !project) throw new Error("Project scope requires paths.project");
  const kitClis = uniqueList(choices.clis);
  const eccClis = uniqueList(choices.ecc?.clis);
  if (eccClis.includes("agy")) throw new Error("ECC is not supported on Antigravity");
  const clis = uniqueList([...kitClis, ...eccClis]);
  if (clis.some((cli) => !CLIS.includes(cli))) throw new Error("Invalid CLI");
  if (eccClis.length && !ecc) throw new Error("Selected ECC requires downloaded paths.ecc");
  const root = local ? project : home;
  const actions = [];
  const warnings = [];
  const destinations = new Map();
  const add = (type, owner, cli, source, destination, content, description) => {
    const action = { type, owner, cli, source, destination, content, description };
    const key = `${type}:${destination.toLowerCase()}`;
    if (destinations.has(key)) {
      const previous = destinations.get(key);
      if (previous.source !== source || previous.content !== content) {
        throw new Error(`Destination collision: ${destination}`);
      }
      return;
    }
    destinations.set(key, action);
    actions.push(action);
  };
  if (local && clis.length) {
    for (const name of ["AGENTS.md", ...(clis.includes("claude") ? ["CLAUDE.md"] : [])]) {
      add("copy", "kit", name === "CLAUDE.md" ? "claude" : clis.includes("codex") ? "codex" : clis[0],
        path.join(kit, "templates", name), path.join(project, name), null, `Project template ${name}`);
    }
  }
  for (const cli of clis) {
    const destinationRules = cli === "claude" ? path.join(root, ".claude", "rules")
      : local ? path.join(project, ".agents", "rules") : path.join(home, ".gemini", "config", "rules");
    const codexBase = path.join(root, ".codex", "vibecoding");
    const codexRules = [];
    if (kitClis.includes(cli)) {
      const rules = readRules(path.join(kit, "rules")).filter((r) => choices.maestri || !r.name.startsWith("maestri-"));
      for (const rule of rules) {
        if (cli === "claude") {
          add("copy", "kit", cli, rule.source, path.join(destinationRules, "vibecoding", rule.name),
            null, `Kit rule: ${rule.name}`);
        } else if (cli === "agy") {
          add("write", "kit", cli, rule.source, path.join(destinationRules, `vibecoding-${rule.name}`),
            convertAntigravityRule(rule.content), `Converted rule: ${rule.name}`);
        } else {
          const destination = path.join(codexBase, "rules", rule.name);
          if (readFrontmatter(rule.content).paths.length) {
            add("copy", "kit", cli, rule.source, destination, null, `On-demand rule: ${rule.name}`);
          }
          codexRules.push({ ...rule, destination });
        }
      }
      const destinationSkills = cli === "claude" ? path.join(root, ".claude", "skills")
        : cli === "codex" || local ? path.join(root, ".agents", "skills")
          : path.join(home, ".gemini", "config", "skills");
      for (const skill of entries(path.join(kit, "skills"))) {
        if (!skill.isDirectory() || (!choices.maestri && skill.name.startsWith("maestri-"))) continue;
        add("copy", "kit", cli, path.join(kit, "skills", skill.name),
          path.join(destinationSkills, skill.name), null, `Kit skill: ${skill.name}`);
      }
    }
    if (eccClis.includes(cli)) {
      const packages = uniqueList(["common", ...(cli === "claude" ? ["web"] : []),
        ...(local ? choices.ecc?.stacks ?? [] : [])]);
      const packageFiles = Object.fromEntries(packages.map((packageName) => {
        if (!/^[a-z0-9-]+$/i.test(packageName)) throw new Error(`Invalid ECC package: ${packageName}`);
        return [packageName, readRules(path.join(ecc, "rules", packageName))];
      }));
      for (const packageName of packages) {
        const directory = path.join(ecc, "rules", packageName);
        const rules = packageFiles[packageName];
        if (cli === "claude") {
          add("copy", "ecc", cli, directory, path.join(destinationRules, "ecc", packageName),
            null, `ECC rules: ${packageName}`);
        } else {
          // Preserve directories so original relative links to common rules keep working.
          add("copy", "ecc", cli, directory, path.join(codexBase, "ecc", packageName), null, `ECC rules: ${packageName}`);
          for (const rule of rules) codexRules.push({ ...rule, owner: "ecc",
            packageName, destinationDirectory: path.join(codexBase, "ecc", packageName),
            destination: path.join(codexBase, "ecc", packageName, rule.name),
            when: packageName === "common" ? `code (${packageName}/${rule.name})` : `the stack ${packageName} (${rule.name})` });
        }
      }
    }
    if (cli === "codex" && codexRules.length) {
      add("block", kitClis.includes(cli) ? "kit" : "ecc", cli, null,
        local ? path.join(project, "AGENTS.md") : path.join(home, ".codex", "AGENTS.md"),
        buildCodexBlock(codexRules), "Codex rules and routing");
      const original = codexBytes(actions, home, project, state.items);
      if (original > 32 * 1024) {
        const action = actions.at(-1);
        action.content = buildCodexBlock(codexRules, { byPackage: true });
        const reduced = codexBytes(actions, home, project, state.items);
        const warning = `Codex: estimated context of ${original} bytes exceeds 32 KiB; `
          + `routing reduced to one line per package (${reduced} bytes).`;
        if (reduced > 32 * 1024) {
          throw new Error(`${warning} Still exceeds the 32768-byte limit; reduce AGENTS.md files before installing.`);
        }
        warnings.push(warning);
      }
    }
  }
  actions.push(...hookActions(choices, { home, kit, project }));
  const plan = actions.map((action) => ({ ...action, situation: situationOf(action, state.items) }));
  if (warnings.length) plan.warnings = warnings;
  return plan;
}
