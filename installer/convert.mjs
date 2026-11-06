// Pure conversion supporting scalar, inline-list and multiline-list YAML paths.
const normalize = (text) => text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

function splitList(text) {
  const items = [];
  let start = 0;
  let quotes = null;
  let braces = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quotes) {
      if (c === "\\" && quotes === '"') i++;
      else if (c === quotes && text[i + 1] === quotes && quotes === "'") i++;
      else if (c === quotes) quotes = null;
    } else if (c === '"' || c === "'") quotes = c;
    else if (c === "{") braces++;
    else if (c === "}") braces--;
    else if (c === "," && !braces) { items.push(text.slice(start, i)); start = i + 1; }
  }
  if (quotes || braces) throw new Error("Invalid paths list");
  items.push(text.slice(start));
  return items.map((item) => {
    const value = item.trim();
    if (value.startsWith('"')) return JSON.parse(value);
    if (value.startsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    return value.replace(/\s+#.*$/, "").trim();
  }).filter(Boolean);
}

export function readFrontmatter(text) {
  const source = normalize(text);
  if (!source.startsWith("---\n")) return { paths: [], body: source };
  const end = /^---[ \t]*$/m.exec(source.slice(4));
  if (!end) throw new Error("Unclosed frontmatter");
  const header = source.slice(4, 4 + end.index);
  const body = source.slice(4 + end.index + end[0].length).replace(/^\n/, "");
  const lines = header.split("\n");
  const index = lines.findIndex((line) => /^paths\s*:/.test(line));
  if (index < 0) return { paths: [], body };
  const value = lines[index].replace(/^paths\s*:\s*/, "").trim();
  let paths;
  if (value.startsWith("[")) {
    if (!value.endsWith("]")) throw new Error("Invalid inline paths list");
    paths = splitList(value.slice(1, -1));
  } else if (value && !value.startsWith("#")) paths = splitList(value);
  else {
    paths = [];
    for (const line of lines.slice(index + 1)) {
      if (/^\S/.test(line) && !line.startsWith("-")) break;
      const item = line.match(/^\s*-\s+(.+)$/);
      if (item) paths.push(...splitList(item[1]));
      else if (line.trim() && !line.trim().startsWith("#")) throw new Error("Invalid paths list");
    }
  }
  return { paths: [...new Set(paths)], body };
}

export function convertAntigravityRule(text, defaultPaths = []) {
  const { paths, body } = readFrontmatter(text);
  const globs = paths.length ? paths : defaultPaths;
  const trigger = globs.length
    ? `trigger: glob\nglobs: ${JSON.stringify(globs.join(", "))}`
    : "trigger: always_on";
  return `---\n${trigger}\n---\n${body}`;
}

// Rule input: { name, content, destination?, owner?, when? }; on-demand rules require destination.
// The executor adds block markers, as for other block actions.
export function buildCodexBlock(rules, { byPackage = false } = {}) {
  const parts = ["## vibecoding-devtools rules"];
  const packages = new Set();
  for (const rule of rules) {
    if (byPackage && rule.owner === "ecc" && rule.packageName) {
      if (!packages.has(rule.packageName)) {
        const when = rule.packageName === "common" ? "code" : `the stack ${rule.packageName}`;
        parts.push(`- If the task involves ${when}, read the ECC package ${rule.packageName} at `
          + `\`${rule.destinationDirectory.replace(/\\/g, "/")}\`.`);
        packages.add(rule.packageName);
      }
      continue;
    }
    const { paths, body } = readFrontmatter(rule.content);
    if (paths.length || rule.owner === "ecc") {
      if (!rule.destination) throw new Error(`On-demand rule without destination: ${rule.name}`);
      const when = paths.length ? `files ${paths.map((p) => JSON.stringify(p)).join(", ")}`
        : rule.when ?? `the ECC package ${rule.name}`;
      parts.push(`- If the task involves ${when}, read \`${rule.destination.replace(/\\/g, "/")}\`.`);
    } else parts.push(body.trim());
  }
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}
