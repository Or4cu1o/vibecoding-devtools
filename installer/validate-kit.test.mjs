import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const validator = fileURLToPath(new URL('../scripts/validate-kit.mjs', import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-validator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, text);
  };
  write('CHANGELOG.md', '## [Unreleased]\n');
  write('rules/risk-process.md', '# Risk process\n');
  write('skills/risk-triage/SKILL.md', '---\nname: risk-triage\ndescription: Assess task risk.\n---\n');
  write('skills/security-surfaces/SKILL.md', '---\nname: security-surfaces\ndescription: Inspect security surfaces.\n---\n');
  write('skills/security-surfaces/surfaces/money.md', '# Money\n');
  return { write, run: () => spawnSync(process.execPath, [validator], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }) };
}

test('Validator accepts English rule, skill and surface references with renamed paths', (t) => {
  const { write, run } = fixture(t);
  write('README.md', 'The rule `risk-process` and skill `risk-triage`.\n'
    + 'Use the `risk-process` rule and the `risk-triage` skill.\n'
    + 'Read surfaces/money.md and the `money` surface.\n');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Kit valid/);
});

test('Validator rejects each missing English reference and ignores fenced examples', (t) => {
  const { write, run } = fixture(t);
  for (const reference of ['rule `missing-rule`', 'the `missing-rule` rule',
    'skill `missing-skill`', 'the `missing-skill` skill', 'surfaces/missing-surface.md',
    'the `missing-surface` surface']) {
    write('README.md', `${reference}\n`);
    const result = run();
    assert.equal(result.status, 1, reference);
    assert.match(result.stderr, /does not exist/);
  }
  write('README.md', '```text\nrule `missing-rule`\n```\n');
  assert.equal(run().status, 0);
});
