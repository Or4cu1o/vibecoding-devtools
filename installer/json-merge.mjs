import { isUtf8 } from 'node:buffer';
import path from 'node:path';
import { hashContent } from './state.mjs';

// Keep source ranges so edits never reserialize unrelated settings or hooks.
export function parse(text) {
  JSON.parse(text.replace(/^\uFEFF/, ''));
  let offset = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  const whitespace = () => { while (/\s/.test(text[offset] ?? '') && offset < text.length) offset++; };
  const string = () => {
    const start = offset++;
    while (text[offset] !== '"') { if (text[offset] === '\\') offset++; offset++; }
    offset++;
    return JSON.parse(text.slice(start, offset));
  };
  const value = () => {
    whitespace();
    const start = offset;
    const node = { start, children: [] };
    const opening = text[offset];
    if (opening === '{' || opening === '[') {
      node.kind = opening === '{' ? 'object' : 'array';
      const closing = opening === '{' ? '}' : ']';
      const keys = new Set();
      offset++;
      whitespace();
      while (text[offset] !== closing) {
        const propertyStart = offset;
        let key;
        if (opening === '{') {
          key = string();
          if (keys.has(key)) throw new Error('Duplicate JSON key');
          keys.add(key);
          whitespace();
          offset++;
        }
        const child = value();
        node.children.push({ key, start: propertyStart, end: child.end, node: child });
        whitespace();
        if (text[offset] !== ',') break;
        offset++;
        whitespace();
      }
      offset++;
    } else if (opening === '"') string();
    else while (offset < text.length && !/[\s,}\]]/.test(text[offset])) offset++;
    node.end = offset;
    node.value = JSON.parse(text.slice(start, offset));
    return node;
  };
  const root = value();
  if (root.kind !== 'object') throw new Error('Hook configuration must be a JSON object');
  return root;
}

export const property = (node, key) => node.children.find((child) => child.key === key);
const normalizePath = (file) => file.replace(/\\/g, '/');
function ownsHook(hook, action) {
  if (!hook || typeof hook !== 'object') return false;
  const scriptPaths = [...action.scriptPaths, ...(action.scriptReferences ?? [])];
  if (action.format === 'agy' && action.destination) {
    scriptPaths.push(...action.scriptPaths.map((file) => path.relative(path.dirname(action.destination), file)));
  }
  return [hook.command, hook.commandWindows].some((command) => typeof command === 'string'
    && scriptPaths.some((file) => {
      const normalized = normalizePath(command);
      const script = normalizePath(file);
      return normalized.includes(`"${script}"`) || normalized.includes(`'${script}'`)
        || normalized.split(/\s+/).includes(script);
    }));
}

function hookArray(root) {
  const hooks = property(root, 'hooks')?.node;
  if (!hooks) return null;
  if (hooks.kind !== 'object') throw new Error('hooks must be a JSON object');
  const event = property(hooks, 'PreToolUse')?.node;
  if (event && event.kind !== 'array') throw new Error('hooks.PreToolUse must be an array');
  return event ?? null;
}

function ownedEntries(root, action, text) {
  const owned = [];
  if (action.format === 'agy') {
    for (const entry of root.children) {
      const events = entry.node.value?.PreToolUse;
      if (Array.isArray(events) && events.some((group) => Array.isArray(group?.hooks)
        && group.hooks.some((hook) => ownsHook(hook, action)))) {
        owned.push({ parent: root, entry, fingerprint: [entry.key, text.slice(entry.node.start, entry.node.end)] });
      }
    }
  } else {
    for (const group of hookArray(root)?.children ?? []) {
      const hooks = property(group.node, 'hooks')?.node;
      if (!hooks) continue;
      if (hooks.kind !== 'array') throw new Error('Hook group hooks must be an array');
      for (const hook of hooks.children) if (ownsHook(hook.node.value, action)) {
        owned.push({ parent: hooks, entry: hook, group, fingerprint: [group.node.value.matcher,
          text.slice(hook.node.start, hook.node.end)] });
      }
    }
  }
  return owned;
}

function read(current) {
  if (current !== null && !isUtf8(current)) throw new Error('Hook configuration is not valid UTF-8');
  const text = current === null ? '{}\n' : current.toString('utf8');
  return { text, root: parse(text) };
}

export function jsonMergeSnapshot(current, action) {
  const { text, root } = read(current);
  const entries = ownedEntries(root, action, text);
  return { hash: hashContent(JSON.stringify(entries.map((entry) => entry.fingerprint))), count: entries.length };
}

export function removeChild(text, parent, entry) {
  const index = parent.children.indexOf(entry);
  const next = parent.children[index + 1];
  const previous = parent.children[index - 1];
  const start = !next && previous ? previous.end : entry.start;
  const end = next ? next.start : entry.end;
  return text.slice(0, start) + text.slice(end);
}

function removeOwned(text, action) {
  while (true) {
    const root = parse(text);
    const owned = ownedEntries(root, action, text);
    if (!owned.length) return text;
    const { parent, entry, group } = owned.at(-1);
    if (group && parent.children.length === 1
      && group.node.children.every((child) => ['matcher', 'hooks'].includes(child.key))) {
      text = removeChild(text, hookArray(root), group);
    } else text = removeChild(text, parent, entry);
  }
}

function removeEmptyContainers(text, paths) {
  for (const keys of paths ?? []) {
    let parent = parse(text);
    for (const key of keys.slice(0, -1)) parent = property(parent, key)?.node;
    if (!parent) continue;
    const entry = property(parent, keys.at(-1));
    if (entry && ['object', 'array'].includes(entry.node.kind) && !entry.node.children.length) {
      text = removeChild(text, parent, entry);
    }
  }
  return text;
}

export function append(text, parent, key, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const unit = text.match(/\n([ \t]+)"/)?.[1] ?? '  ';
  const lineStart = text.lastIndexOf('\n', parent.start) + 1;
  const baseIndent = text.slice(lineStart, parent.start).match(/^[ \t]*/)[0];
  const last = parent.children.at(-1);
  const indent = last ? text.slice(text.lastIndexOf('\n', last.start) + 1, last.start).match(/^[ \t]*/)[0]
    : baseIndent + unit;
  const json = JSON.stringify(value, null, unit).replace(/\n/g, eol + indent);
  const entry = (key === undefined ? '' : JSON.stringify(key) + ': ') + json;
  const position = last ? last.end : parent.start + 1;
  const insertion = last ? ',' + eol + indent + entry : eol + indent + entry + eol + baseIndent;
  return text.slice(0, position) + insertion + text.slice(position);
}

export function mergeJson(current, action, { remove = false } = {}) {
  if (!Array.isArray(action.scriptPaths) || !action.scriptPaths.length
    || !['claude', 'codex', 'agy'].includes(action.format)) throw new Error('Invalid JSON merge action');
  const { text: original, root: originalRoot } = read(current);
  const createdPaths = [];
  if (action.format !== 'agy') {
    const hooks = property(originalRoot, 'hooks')?.node;
    if (!hooks || !property(hooks, 'PreToolUse')) createdPaths.push(['hooks', 'PreToolUse']);
    if (!hooks) createdPaths.push(['hooks']);
  }
  const before = jsonMergeSnapshot(current, action);
  let text = removeOwned(original, action);
  if (!remove) {
    if (action.format === 'agy') {
      for (const [name, entry] of Object.entries(action.entries)) {
        const root = parse(text);
        if (property(root, name)) throw new Error(`Hook name belongs to another command: ${name}`);
        text = append(text, root, name, entry);
      }
    } else {
      let root = parse(text);
      if (!property(root, 'hooks')) text = append(text, root, 'hooks', { PreToolUse: [] });
      root = parse(text);
      const hooks = property(root, 'hooks').node;
      if (hooks.kind !== 'object') throw new Error('hooks must be a JSON object');
      if (!property(hooks, 'PreToolUse')) text = append(text, hooks, 'PreToolUse', []);
      for (const entry of action.entries) text = append(text, hookArray(parse(text)), undefined, entry);
    }
  } else text = removeEmptyContainers(text, action.createdPaths);
  const content = Buffer.from(text);
  const after = jsonMergeSnapshot(content, action);
  // Reapplying identical entries must preserve even the kit entries byte-for-byte.
  return { content: !remove && before.hash === after.hash && current !== null ? current : content,
    before, after, createdPaths };
}

export function jsonMergeSituation(current, action, previous) {
  try {
    const { before, after } = mergeJson(current, action);
    if (before.hash === after.hash) return 'same';
    if (!before.count) return 'new';
    return previous && !previous.pending && previous.hash === before.hash ? 'update' : 'conflict';
  } catch { return 'conflict'; }
}
