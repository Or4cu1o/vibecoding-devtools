import test from 'node:test';
import assert from 'node:assert/strict';
import { envListMerge, envListSituation } from './env-list.mjs';

const action = { key: 'GATEGUARD_EXEMPT_GLOBS', values: ['/tmp/claude-1/**', '**/.maestri/**'] };
const install = (text, record = null, next = action) => {
  const merged = envListMerge(text === null ? null : Buffer.from(text), next, record);
  return { ...merged, text: merged.content?.toString('utf8') ?? null,
    record: { ...next, preexisting: merged.preexisting, createdPaths: merged.createdPaths } };
};
const remove = (text, record) => envListMerge(Buffer.from(text), record, record, { remove: true }).content.toString('utf8');

test('the user value and the rest of the file survive install and uninstall byte for byte', () => {
  const original = '{\n    "model": "x",\n    "env": { "A": "1", "GATEGUARD_EXEMPT_GLOBS": "docs/**, **/.maestri/**" }\n}\n';
  const done = install(original);
  assert.equal(done.text, original.replace('**/.maestri/**"', '**/.maestri/**,/tmp/claude-1/**"'));
  assert.deepEqual(done.record.preexisting, ['**/.maestri/**']);
  assert.equal(install(done.text, done.record).same, true);
  // The user's own copy of a kit value stays after uninstall.
  assert.equal(remove(done.text, done.record), original);
});

test('env and key the kit created leave with it', () => {
  for (const original of ['{\n  "model": "x"\n}\n', '{\n  "env": {\n    "A": "1"\n  }\n}\n']) {
    const done = install(original);
    assert.equal(JSON.parse(done.text).env.GATEGUARD_EXEMPT_GLOBS, '/tmp/claude-1/**,**/.maestri/**');
    assert.equal(remove(done.text, done.record), original);
  }
});

test('an update drops values the earlier kit version added and keeps the user ones', () => {
  const done = install('{"env": {"GATEGUARD_EXEMPT_GLOBS": "mine/**"}}');
  const next = { ...action, values: ['**/.maestri/**'] };
  assert.equal(envListSituation(Buffer.from(done.text), next, done.record), 'update');
  assert.equal(install(done.text, done.record, next).text, '{"env": {"GATEGUARD_EXEMPT_GLOBS": "mine/**,**/.maestri/**"}}');
  // A value the user already had when a later kit version starts listing it stays the user's.
  assert.deepEqual(install(done.text, { ...done.record, values: ['/tmp/claude-1/**'] }).preexisting, ['**/.maestri/**']);
});

test('files the kit cannot read as settings are conflicts', () => {
  for (const text of ['{"env": []}', '{"env": {"GATEGUARD_EXEMPT_GLOBS": 1}}', '{"env": ', '[]']) {
    assert.equal(envListSituation(Buffer.from(text), action, null), 'conflict', text);
  }
  assert.throws(() => envListMerge(null, { ...action, values: ['a,b'] }), /Invalid env list action/);
});
