import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkMaestriProtocol, decodeMessage, validMessage } from './maestri-protocol.mjs';
import { runHook } from './lib/io.mjs';

const report = '~ Ponte | DONE | T-32 | Hooks complete';
const footer = 'Implement hooks.\nref: T-32\nWhen done, load the maestri-protocol skill and report back with:\nmaestri ask "Ponte" "~ Agent | STATUS | T-32 | one-line summary"\nSTATUS is one of DONE, PENDING, BLOCKED, ERROR, ACK. Details go on the following lines.';
const quote = text => `'${text}'`;

for (const status of ['DONE', 'PENDING', 'BLOCKED', 'ERROR', 'ACK', 'ASK']) {
  test(`accepts ${status} on the first line with details`, () => {
    assert.equal(validMessage(`~ Ponte | ${status} | T-32 | Summary\nDetails`), true);
  });
}

for (const message of ['~ Ponte | OK | T-32 | Summary', '~Ponte | DONE | T-32 | Summary', '~ Ponte | DONE | T-32 | ', 'done', 'ref: T-32\nmaestri ask "Ponte" "done"', `${footer}\nUnrelated tail`, footer.replace('STATUS | T-32', 'STATUS | T-33')]) {
  test(`rejects malformed protocol without echoing content: ${message.slice(0, 30)}`, () => {
    assert.equal(validMessage(message), false);
    assert.match(checkMaestriProtocol({ command: `maestri ask Agent ${quote(message)}` }), /protocol header/);
  });
}

test('regression: accepts the footer report-back line in single quotes, rejects mixed quotes', () => {
  const single = footer.replace('maestri ask "Ponte" "~ Agent | STATUS | T-32 | one-line summary"',
    "maestri ask 'Ponte' '~ Agent | STATUS | T-32 | one-line summary'");
  assert.equal(validMessage(single), true);
  assert.equal(validMessage(single.replace("'Ponte'", '"Ponte"').replace("'~", '"~')), false);
});

test('accepts the delegation footer, including CRLF and trailing newline', () => {
  assert.equal(validMessage(footer), true);
  assert.equal(validMessage(`${footer.replaceAll('\n', '\r\n')}\r\n`), true);
  assert.equal(checkMaestriProtocol({ command: `maestri ask Agent ${quote(footer)}` }), undefined);
});

for (const [name, shape] of [
  ['Claude Code', command => ({ tool_name: 'PowerShell', tool_input: { command } })],
  ['Codex', command => ({ turn_id: 'test-turn', tool_name: 'Bash', tool_input: { command } })],
  ['Antigravity', command => ({ toolCall: { name: 'run_command', args: { CommandLine: command } } })],
]) {
  for (const valid of [false, true]) {
    test(`${name}: protocol ${valid ? 'allow' : 'deny'}`, async () => {
      let stdout = '';
      let stderr = '';
      const exit = await runHook(checkMaestriProtocol, {
        stdin: Readable.from([JSON.stringify(shape(`maestri ask Agent ${quote(valid ? report : 'SECRET_MESSAGE')}`))]),
        stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } },
      });
      assert.equal(exit, !valid && name === 'Claude Code' ? 2 : 0);
      if (name === 'Antigravity') assert.equal(JSON.parse(stdout).decision, valid ? 'allow' : 'deny');
      if (name === 'Codex' && !valid) assert.equal(JSON.parse(stdout).hookSpecificOutput.permissionDecision, 'deny');
      assert.equal((stdout + stderr).includes('SECRET_MESSAGE'), false);
    });
  }
}

test('checks every batch value', () => {
  for (const batch of [{ A: report, B: footer }, { A: report, B: 'bad' }, { A: 'bad', B: report }]) {
    const result = checkMaestriProtocol({ command: `maestri ask --batch ${quote(JSON.stringify(batch))}` });
    assert.equal(Boolean(result), Object.values(batch).includes('bad'));
  }
});

for (const command of [
  'maestri ask Agent --raw bad', 'maestri ask --raw Agent bad',
  'maestri ask Agent "$message"', 'maestri ask Agent $message',
  "maestri ask Agent @'\nmessage\n'@", 'maestri ask Agent $(cat prompt)',
  'maestri ask --batch malformed', 'maestri ask --batch \'{"A":42}\'',
  'maestri ask --batch \'["bad"]\'', 'maestri ask --unknown Agent bad',
  'echo maestri ask Agent bad', 'maestri list', 'maestri ask Agent',
]) {
  test(`allows raw, unrelated, or uncertain command: ${command}`, () => {
    assert.equal(checkMaestriProtocol({ command }), undefined);
  });
}

test('checks subsequent literal shell commands', () => {
  assert.match(checkMaestriProtocol({ command: `echo ready && maestri ask Agent bad` }), /protocol header/);
});

test('executable entry point returns exit 2 with a safe reason', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./maestri-protocol.mjs', import.meta.url))], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'maestri ask Agent PRIVATE_MESSAGE' } }),
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /protocol header/);
  assert.equal(result.stderr.includes('PRIVATE_MESSAGE'), false);
});

test('plain messages decode every supported maestri escape and preserve unknown escapes', () => {
  assert.equal(decodeMessage(String.raw`a\nb\tc\e\x41\x7e\q\xZZ`), 'a\nb\tc\x1bA~\\q\\xZZ');
});

for (const message of [footer.replaceAll('\n', String.raw`\n`), String.raw`\x7e Ponte | DONE | T-34 | Complete`, `${report}\\nDetails\\tindented\\e[0m`]) {
  test('plain message becomes valid after decoding', () => {
    assert.equal(checkMaestriProtocol({ command: `maestri ask Agent ${quote(message)}` }), undefined);
  });
}

for (const message of [
  String.raw`~ Ponte | DONE | T-34\nextra | Summary`,
  String.raw`~ Ponte | DONE | T-34\x0aextra | Summary`,
]) {
  test('plain message becomes invalid after decoding', () => {
    assert.equal(validMessage(message), true);
    assert.match(checkMaestriProtocol({ command: `maestri ask Agent ${quote(message)}` }), /protocol header/);
  });
}

for (const message of [String.raw`~\tPonte | DONE | T-34 | Summary`, String.raw`~\ePonte | DONE | T-34 | Summary`]) {
  test('decoded tab and escape cannot replace required header spacing', () => {
    assert.match(checkMaestriProtocol({ command: `maestri ask Agent ${quote(message)}` }), /protocol header/);
  });
}

test('batch JSON uses JSON decoding without applying plain-message escapes again', () => {
  const literal = String.raw`~ Ponte | DONE | T-34\nextra | Summary`;
  for (const [message, valid] of [[literal, true], [footer, true], [footer.replaceAll('\n', String.raw`\n`), false], [String.raw`\x7e Ponte | DONE | T-34 | Complete`, false]]) {
    const command = `maestri ask --batch ${quote(JSON.stringify({ Agent: message }))}`;
    assert.equal(Boolean(checkMaestriProtocol({ command })), !valid);
  }
});
