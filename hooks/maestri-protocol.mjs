import { executable, isMain, runHook, shellCommands, windowsInput } from './lib/io.mjs';

const header = /^~ (?<name>[^|\n]+?) \| (?<status>DONE|PENDING|BLOCKED|ERROR|ACK|ASK) \| (?<ref>[^|\n]+?) \| (?<summary>[^\n]+)$/;
const reason = 'Maestri message must use a valid protocol header or end with the delegation footer.';

export function validMessage(message) {
  const text = message.replace(/\r\n/g, '\n');
  if (text.startsWith('~')) return header.test(text.split('\n')[0]);
  // Match the skill footer at the end, including its report-back instruction. Its quotes may be double or single,
  // each pair matching, so a prompt already wrapped in double quotes can carry the footer unescaped.
  const footer = text.match(/(?:^|\n)ref: ([^\n]+)\nWhen done, load the maestri-protocol skill and report back with:\nmaestri ask (["'])((?:(?!\2)[^\n])+)\2 (["'])~ ([^|\n]+?) \| STATUS \| ([^|\n]+?) \| one-line summary\4\nSTATUS is one of DONE, PENDING, BLOCKED, ERROR, ACK\. Details go on the following lines\.\s*$/);
  return Boolean(footer && footer[1] === footer[6]);
}

function messages(words) {
  if (words.includes('--raw')) return null;
  if (words[0] === '--batch' && words.length === 2) {
    try {
      const batch = JSON.parse(words[1]);
      if (!batch || typeof batch !== 'object' || Array.isArray(batch)) return null;
      const values = Object.values(batch);
      return values.every(value => typeof value === 'string') ? values : null;
    } catch { return null; }
  }
  // Unknown flags or arity are uncertain; do not guess which word is the message.
  if (words.length === 2 && words.every(word => !word.startsWith('--'))) return [decodeMessage(words[1])];
  return null;
}

export function decodeMessage(message) {
  return message.replace(/\\(n|t|e|x[0-9a-fA-F]{2})/g, (_, escape) => {
    if (escape === 'n') return '\n';
    if (escape === 't') return '\t';
    if (escape === 'e') return '\x1b';
    return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
  });
}

export function checkMaestriProtocol(input) {
  const commands = shellCommands(input.command, { windows: windowsInput(input) });
  if (!commands) return;
  for (const words of commands) {
    if (executable(words[0]) !== 'maestri' || words[1] !== 'ask') continue;
    const extracted = messages(words.slice(2));
    if (extracted?.some(message => !validMessage(message))) return reason;
  }
}

if (isMain(import.meta.url)) process.exitCode = await runHook(checkMaestriProtocol);
