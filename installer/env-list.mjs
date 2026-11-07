// Kit values inside one comma-separated string of a JSON settings file's `env` object, such as
// GATEGUARD_EXEMPT_GLOBS in ~/.claude/settings.json. The rest of the file stays byte for byte; the value keeps the
// user's entries and spacing (the string is written back with JSON escaping, so escapes such as \u002f decode).
import { isUtf8 } from 'node:buffer';
import { append, parse, property, removeChild } from './json-merge.mjs';

function validate(action) {
  if (typeof action.key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(action.key) || !Array.isArray(action.values)
    || !action.values.length || action.values.some((v) => typeof v !== 'string' || !v.trim() || v.includes(','))) {
    throw new Error('Invalid env list action');
  }
}

function locate(text, key) {
  const root = parse(text);
  const env = property(root, 'env');
  if (env && env.node.kind !== 'object') throw new Error('env must be a JSON object');
  const entry = env && property(env.node, key);
  if (entry && typeof entry.node.value !== 'string') throw new Error(`env.${key} must be a string`);
  return { root, env, entry };
}

// `record` is the state item of an earlier install: its values, the ones the user already had (`preexisting`, never
// removed) and the containers the kit created. Install adds the missing values and drops values an earlier kit
// version added and this one no longer lists; remove drops the kit's values.
export function envListMerge(current, action, record = null, { remove = false } = {}) {
  validate(action);
  if (current !== null && !isUtf8(current)) throw new Error('Settings file is not valid UTF-8');
  const text = current === null ? '{}\n' : current.toString('utf8');
  const { root, env, entry } = locate(text, action.key);
  // Raw segments keep the user's spacing; values compare trimmed.
  const parts = entry ? entry.node.value.split(',') : [];
  const list = parts.map((v) => v.trim()).filter(Boolean);
  // A value the user had before the kit first listed it stays theirs, including values a later kit version adds.
  const preexisting = [...new Set([...(record?.preexisting ?? []),
    ...action.values.filter((v) => list.includes(v) && !(record?.values ?? []).includes(v))])];
  const createdPaths = record?.createdPaths ?? [...(entry ? [] : [['env', action.key]]), ...(env ? [] : [['env']])];
  const wanted = remove ? [] : action.values;
  const dropped = new Set([...(record?.values ?? []), ...(remove ? action.values : [])]
    .filter((v) => !preexisting.includes(v) && !wanted.includes(v)));
  const added = wanted.filter((v) => !list.includes(v));
  const result = { preexisting, createdPaths };
  if (!added.length && !list.some((v) => dropped.has(v))) return { ...result, same: true, content: current };

  const kept = parts.filter((v) => !dropped.has(v.trim()));
  const next = [...(kept.some((v) => v.trim()) ? kept : []), ...added];
  const created = (keys) => createdPaths.some((p) => p.join('\0') === keys.join('\0'));
  const joined = next.join(',');
  let out;
  if (next.length && entry) out = text.slice(0, entry.node.start) + JSON.stringify(joined) + text.slice(entry.node.end);
  else if (next.length) {
    out = env ? append(text, env.node, action.key, joined) : append(text, root, 'env', { [action.key]: joined });
  } else if (created(['env', action.key])) {
    out = removeChild(text, env.node, entry);
    const rest = parse(out);
    const after = property(rest, 'env');
    if (created(['env']) && !after.node.children.length) out = removeChild(out, rest, after);
  } else out = text.slice(0, entry.node.start) + '""' + text.slice(entry.node.end);
  return { ...result, same: false, content: Buffer.from(out) };
}

// Same bytes with another value list in the state is an update: the state must stop owning values the kit dropped.
export const envListStale = (record, action) => JSON.stringify(record?.values) !== JSON.stringify(action.values);

export function envListSituation(current, action, previous) {
  try {
    if (envListMerge(current, action, previous).same && !(previous && envListStale(previous, action))) return 'same';
    return previous ? 'update' : 'new';
  } catch { return 'conflict'; }
}
