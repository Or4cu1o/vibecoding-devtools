// Installer detection reads machine and project state without writing files.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CLIS, NODE_MINIMUM } from "./clis.mjs";
import { readState } from "./state.mjs";

const isWindows = (platform) => platform === "win32";

// Expand home and environment variables in directory paths.
export function expand(directory, { env = process.env, home = os.homedir() } = {}) {
  return directory
    .replace(/^~(?=$|[\\/])/, home)
    .replace(/%([^%]+)%/g, (_, name) => env[name] ?? env[name.toUpperCase()] ?? `%${name}%`);
}

// Find executables in directories, using PATHEXT on Windows.
export function findIn(bin, directories, { env = process.env, platform = process.platform } = {}) {
  const exts = isWindows(platform)
    ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean).map((e) => e.toLowerCase())
    : [""];
  for (const directory of directories) {
    for (const ext of exts) {
      const filePath = path.join(directory, bin + ext);
      try {
        const st = fs.statSync(filePath);
        if (!st.isFile()) continue;
        if (!isWindows(platform)) fs.accessSync(filePath, fs.constants.X_OK);
        return filePath;
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
          error.filePath = filePath;
          throw error;
        }
      }
    }
  }
  return null;
}

export function pathDirectories(env = process.env) {
  return (env.PATH ?? env.Path ?? "")
    .split(path.delimiter)
    .map((p) => p.replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
}

// Extract the first x.y.z version from --version output.
export function extractVersion(output) {
  return output?.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
}

function run(filePath, args, env) {
  // Windows cmd and bat files require a shell; paths come from disk and arguments are fixed.
  // Installer arguments never contain user input.
  const options = { encoding: "utf8", timeout: 15000, windowsHide: true, env };
  const r = /\.(cmd|bat)$/i.test(filePath)
    ? spawnSync(`"${filePath}" ${args.join(" ")}`, { ...options, shell: true })
    : spawnSync(filePath, args, options);
  if (r.error) return { ok: false, error: r.error.message };
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

// Run --version: an existing executable must also respond.
export function versionOf(filePath, { env = process.env } = {}) {
  const r = run(filePath, ["--version"], env);
  if (!r.ok) return { ok: false, error: r.error ?? (r.output || "--version failed") };
  return { ok: true, version: extractVersion(r.output) };
}

// Detect CLIs on PATH or in known installation directories outside PATH.
export function detectCli(cli, { env = process.env, platform = process.platform,
  home = env.HOME ?? env.USERPROFILE ?? os.homedir() } = {}) {
  env = { ...env, HOME: home, USERPROFILE: home };
  let onPath;
  let filePath;
  try {
    onPath = findIn(cli.bin, pathDirectories(env), { env, platform });
    const directories = (isWindows(platform) ? cli.directories.win : cli.directories.unix).map((p) => expand(p, { env, home }));
    filePath = onPath ?? findIn(cli.bin, directories, { env, platform });
  } catch (error) {
    return { id: cli.id, name: cli.name, state: "error", filePath: error.filePath, error: error.message };
  }
  const install = isWindows(platform) ? cli.install.win : cli.install.unix;
  if (!filePath) return { id: cli.id, name: cli.name, state: "missing", install };
  const v = versionOf(filePath, { env });
  const base = { id: cli.id, name: cli.name, filePath, directory: path.dirname(filePath) };
  if (!v.ok) return { ...base, state: "error", error: v.error };
  return { ...base, state: onPath ? "ok" : "off-path", version: v.version };
}

export function checkNode(version = process.versions.node) {
  const major = Number(version.split(".")[0]);
  return { version, ok: major >= NODE_MINIMUM, minimum: NODE_MINIMUM };
}

// Command-line tools must be on PATH and respond to --version, such as git and gitleaks.
export function checkTool(bin, { env = process.env, platform = process.platform } = {}) {
  let filePath;
  try { filePath = findIn(bin, pathDirectories(env), { env, platform }); }
  catch (error) { return { ok: false, state: "error", filePath: error.filePath, error: error.message }; }
  if (!filePath) return { ok: false, error: "not found in PATH" };
  const v = versionOf(filePath, { env });
  return v.ok ? { ok: true, filePath, version: v.version } : { ok: false, filePath, error: v.error };
}

// Suggest ECC rule packages from project files.
const BY_FILE = [
  [/^(package\.json|tsconfig\.json)$/, "typescript"],
  [/^(pyproject\.toml|requirements.*\.txt|setup\.py|Pipfile)$/, "python"],
  [/^go\.mod$/, "golang"],
  [/^Cargo\.toml$/, "rust"],
  [/^(pom\.xml|build\.gradle)$/, "java"],
  [/^build\.gradle\.kts$/, "kotlin"],
  [/^composer\.json$/, "php"],
  [/^Gemfile$/, "ruby"],
  [/^Package\.swift$/, "swift"],
  [/\.(csproj|sln)$/, "csharp"],
  [/\.fsproj$/, "fsharp"],
  [/^pubspec\.yaml$/, "dart"],
  [/^CMakeLists\.txt$/, "cpp"],
  [/^(cpanfile|Makefile\.PL)$/, "perl"],
  [/^oh-package\.json5$/, "arkts"],
];
const BY_DEPENDENCY = [
  ["react-native", "react-native"],
  ["react", "react"],
  ["next", "react"],
  ["vue", "vue"],
  ["nuxt", "nuxt"],
  ["@angular/core", "angular"],
];

export function detectStacks({ files = [], dependencies = [] }) {
  const stacks = new Set();
  for (const name of files) for (const [re, packageName] of BY_FILE) if (re.test(name)) stacks.add(packageName);
  for (const [dep, packageName] of BY_DEPENDENCY) if (dependencies.includes(dep)) stacks.add(packageName);
  return [...stacks].sort();
}

const IGNORED = new Set(["node_modules", ".git", "vendor", "dist", "build", "target", ".venv", "venv"]);

// Scan the root and two levels of monorepo directories, skipping generated directories.
function projectFiles(root, depth = 2) {
  const files = [];
  const dependencies = new Set();
  const visit = (directory, level) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (level < depth && !IGNORED.has(e.name) && !e.name.startsWith(".")) {
          visit(path.join(directory, e.name), level + 1);
        }
      } else {
        files.push(e.name);
        if (e.name === "package.json") {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(directory, e.name), "utf8"));
            for (const d of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) dependencies.add(d);
          } catch {
            // Ignore dependencies in invalid package.json files.
          }
        }
      }
    }
  };
  visit(root, 0);
  return { files, dependencies: [...dependencies] };
}

export function detectProject(cwd = process.cwd(), { env = process.env } = {}) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, env, encoding: "utf8", windowsHide: true });
  if (r.error) return { inRepository: false, reason: "git cannot run" };
  if (r.status !== 0) {
    // Git status 128 can also mean repository refusal, such as dubious ownership; report the reason.
    const error = (r.stderr ?? "").trim().split("\n")[0];
    const outside = /not a git repository/i.test(error);
    return { inRepository: false, reason: outside ? "outside a git repository" : error || "git failed" };
  }
  const root = path.resolve(r.stdout.trim());
  return { inRepository: true, root, stacks: detectStacks(projectFiles(root)) };
}

function normalizePlugin(cli, item) {
  const { installedSection, ...fields } = item;
  const name = item.name ?? item.id;
  if (typeof name !== "string" || !name.trim()) throw new Error("Plugin has no recognized name");
  const status = typeof (item.status ?? item.state) === "string"
    ? (item.status ?? item.state).replace(/^[^a-z]+/i, "").trim() : null;
  let installed = null; // Missing status proves neither installation nor absence.
  if (typeof item.installed === "boolean") installed = item.installed;
  else if (/^installed\b/i.test(status ?? "")) installed = true;
  else if (/^(?:not[\s_-]+installed|uninstalled)\b/i.test(status ?? "")) installed = false;
  else if (cli !== "codex" && /\b(?:loaded|enabled|disabled|installed)\b/i.test(status ?? "")) installed = true;
  else if (cli !== "codex" && typeof installedSection === "boolean") installed = installedSection;
  else if (cli !== "codex" && status === null && typeof item.enabled === "boolean") installed = true;
  return { ...fields, name: name.trim(), version: item.version ?? null, status, installed };
}

export function parsePlugins(cli, output) {
  const text = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim();
  if (cli === "agy" || /^[\[{]/.test(text)) {
    const json = JSON.parse(text);
    const items = Array.isArray(json) ? json : json?.plugins;
    if (!Array.isArray(items)) throw new Error("Plugin response has no recognized list");
    return items.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Plugin item has no recognized fields");
      return normalizePlugin(cli, item);
    });
  }
  if (!text) throw new Error("Empty plugin response");
  const usableLines = text.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line && !/^warning\b/i.test(line));
  const usableText = usableLines.join(" ").replace(/\s+/g, " ").trim();
  // Official empty plugin-list responses may be preceded by PATH alias warnings.
  // Keep warnings separate from the actual response.
  if (cli === "codex") {
    if (/^no marketplace plugins found\.?$/i.test(usableText)) return [];
  }
  if (cli === "claude" && /^no plugins installed\. use (?:\x60claude plugin install\x60|claude plugin install) to install a plugin\.$/i.test(usableText)) return [];
  const items = [];
  let installedInSection;
  let current;
  let awaitingMarketplaceTable = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean) continue;
    if (/^warning\b/i.test(clean)) continue;
    if (/^Marketplace\s+`[^`]+`$/i.test(clean)) {
      awaitingMarketplaceTable = true;
      current = undefined;
      continue;
    }
    if (/^PLUGIN\s+STATUS\s+VERSION\s+SOURCE$/i.test(clean)) {
      awaitingMarketplaceTable = false;
      continue;
    }
    if (awaitingMarketplaceTable) {
      if ((path.win32.isAbsolute(clean) || path.posix.isAbsolute(clean)) && /[/\\]marketplace\.json$/i.test(clean)) continue;
      throw new Error("Unrecognized plugin response format");
    }
    if (/^installed plugins\s*:\s*$/i.test(clean)) { installedInSection = true; current = undefined; continue; }
    if (/^(?:available|catalog) plugins\s*:\s*$/i.test(clean)) { installedInSection = false; current = undefined; continue; }
    const field = cli === "claude" && clean.match(/^(Version|Scope|Status|Path):\s*(.*)$/i);
    if (field) {
      if (!current || !field[2]) throw new Error("Incomplete plugin response");
      if (field[1].toLowerCase() !== "path") current[field[1].toLowerCase()] = field[2];
      continue;
    }
    if (cli === "claude" && /:$/.test(clean)) {
      // Synced and future section headings are metadata, not plugin entries.
      installedInSection = undefined;
      current = undefined;
      continue;
    }
    // Claude lists installed plugins in blocks with version, scope and status below each name.
    const claudeName = cli === "claude" && clean.match(/^(?:[❯→➜›>•*-]\s*)?([a-z\d._/-]+@[a-z\d._/-]+)$/i);
    if (claudeName) {
      current = { name: claudeName[1] };
      if (installedInSection !== undefined) current.installedSection = installedInSection;
      items.push(current);
      continue;
    }
    if (/^[|:\s+─━┌┬┐└┴┘├┼┤-]+$/.test(clean)) continue;
    const cells = clean.includes("|") ? clean.split("|").map((c) => c.trim()).filter(Boolean) : null;
    const m = cells ? null : clean.match(/^([a-z\d_.@/-]+)\s+(.+)$/i);
    const name = cells?.[0] ?? m?.[1];
    if (!name) throw new Error("Unrecognized plugin response format");
    if (/^(?:name|plugin|plugins)$/i.test(name) && /\bstatus\b/i.test(clean)) continue;
    const rest = cells ? cells.slice(1).join(" ") : m[2];
    const status = cells?.slice(1).find((c) => /^(?:not\s+)?installed\b/i.test(c))
      ?? rest.match(/^(?:\d+\.\d+\.\d+\s+)?((?:not\s+)?installed\b(?:,\s*(?:enabled|disabled))?)/i)?.[1]
      ?? (cli !== "codex" ? rest.match(/\b(enabled|disabled)\b/i)?.[1] : null);
    const version = extractVersion(rest);
    if (!/^[a-z\d_.@/-]+$/i.test(name) || (!status && !version)) throw new Error("Unrecognized plugin response format");
    current = { name, status: status ?? null, version, original: line };
    if (cli === "claude" && installedInSection !== undefined) current.installedSection = installedInSection;
    items.push(current);
  }
  // Headers and table scaffolding alone never establish absence.
  if (!items.length || awaitingMarketplaceTable) throw new Error("Unrecognized plugin response format");
  return items.map((item) => normalizePlugin(cli, item));
}

// executePlugins matches spawnSync; tests never invoke actual CLIs.
export function detectInstalled({ home, project = null, clis = [], executePlugins = spawnSync } = {}) {
  if (!home) throw new Error("detectInstalled requires home");
  const state = readState({ home });
  const names = fs.readdirSync(new URL("../skills/", import.meta.url), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const skills = [];
  const directories = {
    claude: [["global", path.join(home, ".claude", "skills")]],
    codex: [["global", path.join(home, ".agents", "skills")]],
    agy: [["global", path.join(home, ".gemini", "config", "skills")]],
  };
  if (project) {
    directories.claude.push(["project", path.join(project, ".claude", "skills")]);
    for (const cli of ["codex", "agy"]) directories[cli].push(["project", path.join(project, ".agents", "skills")]);
  }
  for (const [cli, locations] of Object.entries(directories)) {
    for (const [scope, directory] of locations) {
      for (const name of names) {
        const filePath = path.join(directory, name);
        try {
          fs.lstatSync(filePath);
          skills.push({ cli, scope, name, filePath });
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        }
      }
    }
  }
  const plugins = {};
  for (const { id } of CLIS) {
    const cli = clis.find((c) => c.id === id);
    plugins[id] = { state: "unknown", items: null, error: "CLI not detected" };
    if (!cli?.filePath || cli.state === "missing") continue;
    try {
      if (id === "codex" || id === "claude") {
        const configDir = path.join(home, id === "codex" ? ".codex" : ".claude");
        try {
          if (!fs.statSync(configDir).isDirectory()) {
            throw new Error(`Configuration path is not a directory: ${configDir}`);
          }
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
          plugins[id] = { state: "known", items: [], output: "", reason: "configuration directory missing" };
          continue;
        }
      }
      const args = ["plugin", "list", ...(id === "agy" ? ["--json"] : [])];
      const env = { ...process.env };
      for (const [name, value] of Object.entries({ HOME: home, USERPROFILE: home,
        CODEX_HOME: path.join(home, ".codex"), CLAUDE_CONFIG_DIR: path.join(home, ".claude") })) {
        // Avoid differently capitalized duplicate environment keys in Windows subprocesses.
        if (process.platform === "win32") for (const existing of Object.keys(env)) {
          if (existing.toUpperCase() === name) delete env[existing];
        }
        env[name] = value;
      }
      // Codex remote catalogs may exceed 2 MB and take longer than three seconds.
      const options = { encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
        cwd: project ?? home, env };
      let command = cli.filePath;
      let argumentsList = args;
      if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
        if (/["%!\r\n\0]/.test(command)) throw new Error("Invalid CLI path for cmd.exe");
        argumentsList = ["/d", "/s", "/c", `"\"${command}\" ${args.join(" ")}"`];
        command = "cmd.exe";
        options.windowsVerbatimArguments = true;
      }
      const r = executePlugins(command, argumentsList, options);
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`plugin list failed (${r.status ?? r.signal ?? "no status"})`);
      const output = String(r.stdout ?? "").trim();
      const items = parsePlugins(id, output);
      plugins[id] = { state: "known", items, output };
    } catch (error) {
      plugins[id] = { state: "unknown", items: null, error: error.message };
    }
  }
  return { state, skills, plugins };
}

export function detectAll({ cwd = process.cwd(), env = process.env, platform = process.platform,
  home = env.HOME ?? env.USERPROFILE ?? os.homedir(), executePlugins = spawnSync } = {}) {
  env = { ...env, HOME: home, USERPROFILE: home };
  const clis = CLIS.map((cli) => detectCli(cli, { env, platform, home }));
  const project = detectProject(cwd, { env });
  return {
    platform,
    node: checkNode(),
    git: checkTool("git", { env, platform }),
    gitleaks: checkTool("gitleaks", { env, platform }),
    clis,
    project,
    installed: detectInstalled({ home, project: project.inRepository ? project.root : null,
      clis, executePlugins }),
  };
}
