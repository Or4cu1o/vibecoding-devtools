// Third-party planning performs no commands or writes; only fetchEcc downloads the repository.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const thirdParty = JSON.parse(fs.readFileSync(new URL("./third-party.json", import.meta.url), "utf8"));
const CLIS = ["claude", "codex", "agy"];
const providers = { claude: "claude", codex: "codex", agy: "antigravity" };
const versionOf = (value) => typeof value === "string" ? value.match(/\d+\.\d+\.\d+(?:-[\w.-]+)?/)?.[0] ?? null : null;

// Read install-state only; return ECC records and warnings.
export function detectThirdParty(home, project = null) {
  if (!home) throw new Error("detectThirdParty requires home");
  const result = { ecc: [], warnings: [] };
  const locations = [["claude", "global", path.join(home, ".claude", "ecc", "install-state.json")]];
  if (project) locations.push(
    ["claude", "project", path.join(project, ".claude", "ecc", "install-state.json")],
  );
  for (const [cli, scope, file] of locations) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); }
    catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) continue;
      throw error;
    }
    const item = { cli, scope, method: "npx", file, version: null };
    try {
      const state = JSON.parse(text.replace(/^\uFEFF/, ""));
      if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("object expected");
      // Numeric schemaVersion or version describes the format rather than the ECC release.
      item.version = versionOf(state.eccVersion) ?? versionOf(state.packageVersion)
        ?? versionOf(state.source?.version) ?? versionOf(state.version);
    } catch (error) {
      item.error = `Invalid install-state: ${file}: ${error.message}`;
      result.warnings.push(item.error);
    }
    result.ecc.push(item);
  }
  return result;
}

function findPlugin(detection, cli, owner, scope) {
  const uniqueList = detection.installed?.plugins?.[cli] ?? detection.plugins?.[cli];
  const items = Array.isArray(uniqueList) ? uniqueList
    : uniqueList?.state === "known" && Array.isArray(uniqueList.items) ? uniqueList.items : null;
  if (!items || items.some((item) => typeof item?.installed !== "boolean")) return { known: false };
  const plugin = items.find((item) => {
    // User/global plugins are also loaded in projects. Claude calls global scope "user".
    const pluginScope = item.scope === "user" ? "global" : item.scope;
    if (!item.installed || (pluginScope && pluginScope !== scope && pluginScope !== "global")) return false;
    const name = item.id ?? item.name ?? "";
    return owner === "ecc" ? /\b(?:ecc|everything-claude-code)\b/i.test(name) : /\bimpeccable\b/i.test(name);
  });
  return { known: true, plugin };
}

function hasImpeccableSkill(cli, root, local) {
  const directories = cli === "claude" ? [".claude"] : cli === "codex" ? [".agents"]
    : local ? [".agents", ".agent"] : [path.join(".gemini", "config")];
  return directories.some((directory) => {
    try { return fs.statSync(path.join(root, directory, "skills", "impeccable", "SKILL.md")).isFile(); }
    catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
      throw error;
    }
  });
}

// Return commands with warnings attached to the list for callers to display.
// Accept detection.thirdParty or detection.installed.thirdParty.
// Use previously queried detection.installed.plugins lists without invoking CLIs.
export function thirdPartyActions(choices, detection = {}, paths = {}) {
  const { home, project } = paths;
  if (!home) throw new Error("paths.home is required");
  if (!["global", "project"].includes(choices.scope)) throw new Error("Invalid scope");
  const local = choices.scope === "project";
  if (local && !project) throw new Error("Project scope requires paths.project");
  const select = (owner) => {
    const items = [...new Set(choices[owner]?.clis ?? [])];
    if (items.some((cli) => !CLIS.includes(cli))) throw new Error("Invalid CLI");
    return CLIS.filter((cli) => items.includes(cli));
  };
  const eccClis = select("ecc"), impeccableClis = select("impeccable");
  if (eccClis.includes("agy")) throw new Error("ECC is not supported on Antigravity");
  const installed = detection.thirdParty ?? detection.installed?.thirdParty ?? detectThirdParty(home, project);
  const actions = [];
  actions.warnings = [...(installed.warnings ?? [])];
  const npx = (detection.platform ?? process.platform) === "win32" ? "npx.cmd" : "npx";
  const cwd = project ?? home;
  const codexHome = path.join(home, ".codex");
  const preservePlugin = (owner, cli) => {
    const { plugin } = findPlugin(detection, cli, owner, choices.scope);
    if (!plugin) return false;
    const version = versionOf(plugin.version);
    const pinned = thirdParty[owner].version;
    const outdated = version && version.localeCompare(pinned, undefined, { numeric: true }) < 0;
    const description = `${owner} in ${cli} already installed as a plugin (${version ?? "version unknown"}); active method preserved.`;
    actions.push({ type: "summary", owner, cli, scope: choices.scope, situation: "same",
      version, method: "plugin", description });
    actions.warnings.push(description);
    if (outdated) actions.warnings.push(`${owner} in ${cli} is outdated: installed plugin ${version}, kit pins ${pinned}. Update through the plugin channel; no alternate installation scheduled.`);
    return true;
  };
  const situation = (owner, cli, method) => {
    const { known, plugin } = findPlugin(detection, cli, owner, choices.scope);
    if (!known) {
      const name = owner === "ecc" ? "ECC" : "Impeccable";
      actions.warnings.push(`Could not confirm whether ${name} is already installed as a plugin in ${cli}; installation blocked.`);
      return "conflict";
    }
    if (plugin) {
      if (method !== "plugin") {
        actions.warnings.push(`${owner} in ${cli} already installed as a plugin; active method preserved.`);
        return "same";
      }
      const version = versionOf(typeof plugin === "string" ? plugin : plugin.version);
      return !version || version === thirdParty[owner].version ? "same" : "update";
    }
    const previous = (installed[owner] ?? []).find((i) => i.cli === cli && i.scope === choices.scope);
    if (!previous) return "new";
    if (previous.error) return "conflict";
    if (previous.method && previous.method !== method) {
      actions.warnings.push(`${owner} in ${cli} already installed through ${previous.method}; active method preserved.`);
      return "same";
    }
    if (!previous.version) actions.warnings.push(`${owner} in ${cli} already installed without a version; installation preserved.`);
    return !previous.version || previous.version === thirdParty[owner].version ? "same" : "update";
  };
  const add = (owner, cli, cmd, args, state, extra = {}) => {
    actions.push({ type: "command", owner, cli, cmd, args, cwd, env: {}, scope: choices.scope,
      version: thirdParty[owner].version, situation: state, description: `${owner} in ${cli}`, ...extra });
  };
  for (const cli of eccClis) {
    if (preservePlugin("ecc", cli)) continue;
    if (cli === "codex" && !fs.existsSync(codexHome)) {
      actions.warnings.push("Open Codex once and run the installer again to install ECC on Codex.");
      continue;
    }
    const state = situation("ecc", cli, cli === "codex" ? "plugin" : "npx");
    if (cli === "codex") {
      const cmd = detection.clis?.find((c) => c.id === cli)?.filePath ?? "codex";
      const env = { CODEX_HOME: codexHome };
      add("ecc", cli, cmd, ["plugin", "marketplace", "add", thirdParty.ecc.marketplace], state, { env });
      add("ecc", cli, cmd, ["plugin", "add", thirdParty.ecc.plugin], state,
        { env, uninstall: { cmd, args: ["plugin", "remove", thirdParty.ecc.plugin], cwd, env } });
      if (choices.ecc?.hooks) actions.warnings.push("ECC hooks on Codex require approval in /hooks.");
      continue;
    }
    const hooks = cli === "claude" && choices.ecc?.hooks === true;
    const modules = [...thirdParty.ecc.modules, ...(hooks ? [thirdParty.ecc.hooksModule] : [])];
    const target = local ? "claude-project" : "claude";
    const packageName = `${thirdParty.ecc.packageName}@${thirdParty.ecc.version}`;
    add("ecc", cli, npx, ["-y", packageName, "install", "--target", target,
      "--modules", modules.join(","), hooks ? "--enable-hooks" : "--no-hooks"], state,
    { uninstall: { cmd: npx, args: ["-y", packageName, "uninstall", "--target", target], cwd } });
  }
  if (impeccableClis.length) {
    const packageName = `${thirdParty.impeccable.packageName}@${thirdParty.impeccable.version}`;
    const manualClis = impeccableClis.filter((cli) => !preservePlugin("impeccable", cli));
    const missingItems = manualClis.filter((cli) => !hasImpeccableSkill(cli, local ? project : home, local));
    // Group only CLIs with matching situations to avoid reinstalling an existing provider.
    const groups = new Map();
    for (const cli of missingItems.length ? missingItems : manualClis) {
      const state = missingItems.length ? situation("impeccable", cli, "npx") : "same";
      if (!groups.has(state)) groups.set(state, []);
      groups.get(state).push(cli);
    }
    if (!groups.size) return actions;
    const warning = "Impeccable 4.8.0 does not support uninstalling; manually check created files before removing them.";
    actions.warnings.push(warning);
    const extra = { cwd: local ? project : home, env: { DO_NOT_TRACK: "1" }, warning };
    const telemetryState = [...groups.keys()].every((state) => state === "same") ? "same" : "new";
    add("impeccable", manualClis[0], npx, ["-y", packageName, "telemetry", "off"], telemetryState, extra);
    for (const [state, clis] of groups) add("impeccable", clis[0], npx,
      ["-y", packageName, "install", `--providers=${clis.map((cli) => providers[cli]).join(",")}`,
        local ? "--project" : "--global", "-y",
        ...(choices.impeccable?.hooks === true ? [] : ["--no-hooks"])], state, { ...extra, clis });
  }
  return actions;
}

// Explicit fetching is separate from planning; cacheDir is the installer cache directory.
// Return paths.ecc; injected execution keeps tests offline.
export function fetchEcc(cacheDir, { execute = spawnSync } = {}) {
  if (!cacheDir) throw new Error("fetchEcc requires cacheDir");
  const cache = path.resolve(cacheDir);
  const destination = path.join(cache, `ecc-${thirdParty.ecc.version}`);
  const run = (args, cwd) => {
    const r = execute("git", args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`Failed to fetch ECC: ${r.stderr ?? r.status}`);
    return String(r.stdout ?? "").trim();
  };
  if (fs.existsSync(destination)) {
    const tag = run(["describe", "--tags", "--exact-match", "HEAD"], destination);
    if (tag !== thirdParty.ecc.tag || !fs.existsSync(path.join(destination, "rules"))) {
      throw new Error(`Invalid ECC cache: ${destination}; expected ${thirdParty.ecc.tag} with rules`);
    }
    return destination;
  }
  fs.mkdirSync(cache, { recursive: true });
  run(["clone", "--depth", "1", "--branch", thirdParty.ecc.tag, thirdParty.ecc.repository, destination], cache);
  return destination;
}
