import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isUtf8 } from 'node:buffer';
import { readState, saveState, hashContent, writeAtomic, withLock } from './state.mjs';
import { mergeJson, jsonMergeSnapshot } from './json-merge.mjs';

export const START = '<!-- vibecoding-devtools:start -->';
export const END = '<!-- vibecoding-devtools:end -->';
const report = (dryRun) => ({ ok: true, dryRun, actions: [], conflicts: [], warnings: [], errors: [] });
const exists = (p) => {
  try { return fs.lstatSync(p); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};
const marker = (item) => item.type === 'block' ? item.marker ?? START : null;
const identity = (item) => item.type === 'command'
  ? JSON.stringify([item.type, item.cmd, item.args, item.cwd, item.cli, item.owner])
  : JSON.stringify([item.type, path.resolve(item.destination), marker(item)]);
const confirmed = ({ pending, operation, previous, hashBefore, diskHash, ...item }) => item;

function checkPath(destination) {
  for (let p = path.resolve(destination); ; p = path.dirname(p)) {
    if (exists(p)?.isSymbolicLink()) throw new Error(`Symbolic link not allowed: ${p}`);
    if (p === path.dirname(p)) break;
  }
}

function utf8(bytes) {
  if (!isUtf8(bytes) || bytes.subarray(0, 2).equals(Buffer.from([255, 254]))
    || bytes.subarray(0, 2).equals(Buffer.from([254, 255]))) return null;
  return bytes.toString('utf8');
}

function blockRange(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start || text.indexOf(START, start + START.length) >= 0
    || text.indexOf(END, end + END.length) >= 0) throw new Error('Invalid or duplicate block markers');
  return { start, end: end + END.length, content: text.slice(start, end + END.length) };
}

function withoutBlock(text, block, item) {
  let start = block.start;
  if (item.separator && text.slice(start - item.separator.length, start) === item.separator) {
    start -= item.separator.length;
  }
  return text.slice(0, start) + text.slice(block.end);
}

// Remove only known intact blocks when validating ownership of their containing files.
function fileBase(current, destination, items) {
  const record = items.find((i) => i.type === 'block' && i.destination === destination);
  if (!record) return { bytes: current, suffix: '' };
  const text = utf8(current);
  if (text === null) throw new Error('Block file is not valid UTF-8');
  const block = blockRange(text);
  if (!block) return { bytes: current, suffix: '' };
  if (record.pending || hashContent(block.content) !== record.hash) {
    throw new Error('Modified or pending block; file retained');
  }
  return { bytes: Buffer.from(withoutBlock(text, block, record)), suffix: (record.separator ?? '') + block.content };
}

function resolveCommand(cmd, options) {
  const win = process.platform === 'win32';
  const envValue = (name) => Object.entries(options.env).find(([k]) => k.toUpperCase() === name)?.[1];
  const extensions = win && !path.extname(cmd)
    ? (envValue('PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  const directories = /[\\/]/.test(cmd) || path.isAbsolute(cmd) ? ['']
    : (envValue('PATH') ?? '').split(path.delimiter).filter(Boolean).map((p) => p.replace(/^"(.*)"$/, '$1'));
  for (const directory of directories) for (const ext of extensions) {
    const file = path.resolve(options.cwd, directory, cmd + ext);
    try {
      if (!fs.statSync(file).isFile()) continue;
      if (!win) fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch { /* try the next extension or directory */ }
  }
  throw new Error(`Command not found in PATH: ${cmd}`);
}

function command(action, home) {
  if (typeof action.cmd !== 'string' || !action.cmd || !Array.isArray(action.args)
    || action.args.some((a) => typeof a !== 'string')) throw new Error('Command requires cmd and a string array for args');
  const env = { ...process.env };
  for (const [key, value] of Object.entries({ HOME: home, USERPROFILE: home, ...action.env })) {
    if (process.platform === 'win32') for (const existing of Object.keys(env)) {
      if (existing.toUpperCase() === key.toUpperCase()) delete env[existing];
    }
    env[key] = value;
  }
  const options = { cwd: action.cwd ?? home, env, encoding: 'utf8', shell: false, windowsHide: true };
  let cmd = resolveCommand(action.cmd, options);
  let args = action.args;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)) {
    if ([cmd, ...args].some((a) => /["%!\r\n\0]/.test(a))) throw new Error('Unsafe argument for cmd.exe');
    args = ['/d', '/s', '/c', `"${[cmd, ...args].map((a) => `"${a}"`).join(' ')}"`];
    cmd = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe');
    options.windowsVerbatimArguments = true;
  }
  return { cmd, args, options };
}

function run(prepared, action) {
  const { cmd, args, options } = prepared;
  const r = spawnSync(cmd, args, options);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Command failed (${r.status ?? r.signal}): ${action.cmd}\n${r.stderr ?? ''}`);
  return { stdout: r.stdout, stderr: r.stderr };
}

function session(home, dryRun, r, work) {
  try {
    return withLock(home, () => {
      const state = readState({ home });
      const persist = () => { if (!dryRun) saveState(state, { home }); };
      const save = (item) => {
        const i = state.items.findIndex((x) => identity(x) === identity(item));
        if (i < 0) state.items.push(item); else state.items[i] = item;
        persist();
      };
      const forget = (item) => {
        const i = state.items.findIndex((x) => identity(x) === identity(item));
        if (i >= 0) state.items.splice(i, 1);
        persist();
      };
      // Never repeat pending commands: disk hashes cannot prove external process effects.
      for (const item of [...state.items]) if (item.pending) {
        if (item.type === 'command') {
          r.warnings.push({ item, reason: 'Pending command: check the third party before retrying or uninstalling' });
          continue;
        }
        checkPath(item.destination);
        const st = exists(item.destination);
        const current = st?.isFile() ? fs.readFileSync(item.destination) : null;
        const hash = current ? hashContent(current) : null;
        if ((!st || st.isFile()) && hash === item.diskHash) {
          if (item.operation === 'remove') forget(item); else save(confirmed(item));
        } else if ((!st || st.isFile()) && hash === item.hashBefore) {
          if (item.previous) save(item.previous); else forget(item);
        } else r.warnings.push({ item, reason: 'Pending item has unexpected content; retained for review' });
      }
      work({ state, save, forget });
      return r;
    }, { dryRun });
  } catch (e) {
    r.ok = false;
    r.errors.push({ message: e.message });
    return r;
  }
}

function effect(item, previous, current, content, context, r, action, apply, status = 'executed') {
  const pending = { ...item, pending: true, operation: status === 'removed' ? 'remove' : 'install',
    previous: previous ?? null, hashBefore: current === null ? null : hashContent(current),
    diskHash: content === null ? null : hashContent(content) };
  context.save(pending);
  const record = { ...action, status: r.dryRun ? 'planned' : 'pending' };
  r.actions.push(record);
  if (!r.dryRun) apply();
  if (status === 'removed') context.forget(item); else context.save(item);
  record.status = r.dryRun ? 'planned' : status;
}

// Return { ok, dryRun, actions, conflicts, warnings, errors }; skip identical items and conflicts.
export function execute(plan, { dryRun = false, force = false, home = os.homedir() } = {}) {
  const r = report(dryRun);
  return session(home, dryRun, r, (context) => {
    const { state } = context;
    const conflict = (action, reason) => { r.conflicts.push({ ...action, reason }); r.ok = false; };
    const apply = (action) => {
      if (!['kit', 'ecc', 'impeccable'].includes(action.owner) || !action.cli) throw new Error('Action requires owner and cli');
      if (action.situation === 'same') { r.actions.push({ ...action, status: 'same' }); return; }
      if (action.situation === 'conflict' && !force) { conflict(action, 'Conflict identified in plan'); return; }
      if (action.type === 'command') {
        const item = { ...action, cwd: action.cwd ?? home };
        const previous = state.items.find((i) => identity(i) === identity(item));
        if (previous?.pending) { conflict(action, 'Pending command; check effects before retrying'); return; }
        if (previous && previous.version === item.version
          && JSON.stringify(previous.env ?? {}) === JSON.stringify(item.env ?? {})) {
          r.actions.push({ ...action, status: 'same' });
          return;
        }
        const prepared = command(action, home);
        effect(item, previous, null, null, context, r, action, () => {
          Object.assign(r.actions.at(-1), run(prepared, action));
        });
        return;
      }
      if (!['copy', 'write', 'block', 'json-merge'].includes(action.type)) throw new Error(`Unknown type: ${action.type}`);
      if (!['copy', 'json-merge'].includes(action.type) && typeof action.content !== 'string'
        && !(action.type === 'write' && Buffer.isBuffer(action.content))) throw new Error('Action requires text content');
      const destination = path.resolve(action.destination);
      checkPath(destination);
      if (action.type === 'copy') {
        const st = fs.lstatSync(action.source);
        if (st.isSymbolicLink()) throw new Error(`Source is a symbolic link: ${action.source}`);
        if (st.isDirectory()) {
          const relative = path.relative(path.resolve(action.source), destination);
          if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
            throw new Error('Copy destination cannot be inside source');
          }
          if (exists(destination) && !exists(destination).isDirectory()) { conflict(action, 'Destination is not a directory'); return; }
          if (!dryRun) fs.mkdirSync(destination, { recursive: true });
          r.actions.push({ ...action, destination, status: dryRun ? 'planned' : 'executed' });
          for (const name of fs.readdirSync(action.source).sort()) apply({ ...action, situation: undefined,
            source: path.join(action.source, name), destination: path.join(destination, name) });
          return;
        }
        if (!st.isFile()) throw new Error('Source is not a regular file');
      }
      const st = exists(destination);
      if (st && !st.isFile()) { conflict(action, 'Destination is not a regular file'); return; }
      const key = { ...action, destination };
      const previous = state.items.find((i) => identity(i) === identity(key));
      if (previous?.pending) { conflict(action, 'Pending item; unexpected content'); return; }
      const current = st ? fs.readFileSync(destination) : null;
      let content;
      let extra;
      if (action.type === 'json-merge') {
        let merged;
        try { merged = mergeJson(current, action); }
        catch (e) { conflict(action, e.message); return; }
        if (merged.before.hash === merged.after.hash) { r.actions.push({ ...action, status: 'same' }); return; }
        if (merged.before.count && !force && (!previous || merged.before.hash !== previous.hash)) {
          conflict(action, 'Preexisting or modified JSON entries'); return;
        }
        content = merged.content;
        extra = { hash: merged.after.hash, format: action.format, scriptPaths: action.scriptPaths,
          created: previous?.created ?? !st, createdPaths: previous?.createdPaths ?? merged.createdPaths };
      } else if (action.type === 'block') {
        const text = current ? utf8(current) : '';
        if (text === null) { conflict(action, 'File is not valid UTF-8'); return; }
        const block = blockRange(text);
        const replacement = `${START}\n${action.content}\n${END}`;
        if (blockRange(replacement)?.content !== replacement) throw new Error('Content contains reserved markers');
        if (block?.content === replacement) { r.actions.push({ ...action, status: 'same' }); return; }
        if (block && !force && (!previous || hashContent(block.content) !== previous.hash)) {
          conflict(action, 'Preexisting or modified block'); return;
        }
        const separator = text && !text.endsWith('\n') ? '\n' : '';
        content = block ? text.slice(0, block.start) + replacement + text.slice(block.end) : text + separator + replacement;
        extra = { hash: hashContent(replacement), marker: START,
          separator: block ? previous?.separator ?? '' : separator, created: previous?.created ?? !st };
      } else {
        const expected = action.type === 'copy' ? fs.readFileSync(action.source) : Buffer.from(action.content);
        let base;
        try { base = current ? fileBase(current, destination, state.items) : { bytes: null, suffix: '' }; }
        catch (e) { conflict(action, e.message); return; }
        if (base.bytes?.equals(expected)) { r.actions.push({ ...action, status: 'same' }); return; }
        if (st && !force && (!previous || hashContent(base.bytes) !== previous.hash)) {
          conflict(action, 'Preexisting or modified file'); return;
        }
        content = Buffer.concat([expected, Buffer.from(base.suffix)]);
        extra = { hash: hashContent(expected) };
      }
      const item = { type: action.type, destination, owner: action.owner, cli: action.cli, ...extra };
      effect(item, previous, current, content, context, r, { ...action, destination },
        () => writeAtomic(destination, content));
    };
    for (const action of plan) {
      try { apply(action); }
      catch (e) { r.ok = false; r.errors.push({ action, message: e.message }); break; }
    }
  });
}

// Remove blocks before files and revalidate pending items before any effects.
export function uninstall({ home = os.homedir(), dryRun = false } = {}) {
  const r = report(dryRun);
  return session(home, dryRun, r, (context) => {
    const { state } = context;
    const isRegistration = (item) => ['block', 'json-merge'].includes(item.type);
    const order = [...state.items].reverse().sort((a, b) => Number(isRegistration(b)) - Number(isRegistration(a)));
    const virtualFiles = new Map();
    for (const item of order) {
      try {
        if (item.pending) { r.warnings.push({ item, reason: 'Pending item was not removed' }); continue; }
        if (item.type === 'command') {
          const inverse = item.uninstall ?? item.uninstallation;
          if (!inverse) { r.warnings.push({ item, reason: 'Command has no registered uninstall; check third-party files' }); continue; }
          const action = { ...inverse, cwd: inverse.cwd ?? item.cwd, env: { ...item.env, ...inverse.env } };
          const prepared = command(action, home);
          effect(item, item, null, null, context, r, item, () => run(prepared, action), 'removed');
          continue;
        }
        checkPath(item.destination);
        const st = exists(item.destination);
        if (st && !st.isFile()) throw new Error('Destination is not a regular file');
        const current = virtualFiles.has(item.destination) ? virtualFiles.get(item.destination) : st ? fs.readFileSync(item.destination) : null;
        if (current === null) {
          context.forget(item);
          r.actions.push({ ...item, status: 'missing' });
          continue;
        }
        let remaining = null;
        if (item.type === 'json-merge') {
          let snapshot;
          try { snapshot = jsonMergeSnapshot(current, item); }
          catch (e) { r.warnings.push({ item, reason: `${e.message}; retained` }); continue; }
          if (!snapshot.count) { context.forget(item); r.actions.push({ ...item, status: 'missing' }); continue; }
          if (snapshot.hash !== item.hash) { r.warnings.push({ item, reason: 'Modified JSON entries; retained' }); continue; }
          remaining = mergeJson(current, item, { remove: true }).content;
          if (item.created && Object.keys(JSON.parse(remaining.toString('utf8').replace(/^\uFEFF/, ''))).length === 0) remaining = null;
        } else if (item.type === 'block') {
          const text = utf8(current);
          if (text === null) { r.warnings.push({ item, reason: 'File is not valid UTF-8; retained' }); continue; }
          const block = blockRange(text);
          if (!block) { context.forget(item); r.actions.push({ ...item, status: 'missing' }); continue; }
          if (hashContent(block.content) !== item.hash) { r.warnings.push({ item, reason: 'Modified block; retained' }); continue; }
          const remainingText = withoutBlock(text, block, item);
          remaining = item.created && remainingText === '' ? null : Buffer.from(remainingText);
        } else if (hashContent(current) !== item.hash) {
          r.warnings.push({ item, reason: 'Modified file; retained' }); continue;
        }
        effect(item, item, current, remaining, context, r, item, () => {
          if (remaining === null) fs.unlinkSync(item.destination); else writeAtomic(item.destination, remaining);
        }, 'removed');
        if (dryRun) virtualFiles.set(item.destination, remaining);
      } catch (e) { r.ok = false; r.errors.push({ item, message: e.message }); break; }
    }
  });
}
