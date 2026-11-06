import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseInput(text) {
  try {
    const input = JSON.parse(text);
    if (input?.toolCall?.name === 'run_command') {
      const args = input.toolCall.args;
      if (typeof args?.CommandLine === 'string') {
        return { cli: 'antigravity', command: args.CommandLine, cwd: args.Cwd, shell: args.Shell ?? input.shell };
      }
    }
    if (['Bash', 'PowerShell'].includes(input?.tool_name)
        && typeof input?.tool_input?.command === 'string') {
      // Claude Code and Codex share the same wire format.
      return { cli: 'claude-codex', command: input.tool_input.command, cwd: input.cwd,
        shell: input.tool_name === 'PowerShell' ? 'PowerShell' : input.shell };
    }
  } catch { /* Invalid JSON is an uncertain input, so allow it. */ }
  return null;
}

export function respond(input, reason, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (input?.cli === 'antigravity') {
    stdout.write(`${JSON.stringify(reason ? { decision: 'deny', reason } : {})}\n`);
    return 0;
  }
  if (input && reason) {
    stderr.write(`${reason}\n`);
    return 2;
  }
  return 0;
}

export async function runHook(check, {
  stdin = process.stdin, stdout = process.stdout, stderr = process.stderr,
} = {}) {
  let input = null;
  let reason;
  try {
    let text = '';
    for await (const chunk of stdin) text += chunk;
    input = parseInput(text);
    if (input) reason = await check(input, { stderr });
  } catch { /* A hook must never deny because of its own failure. */ }
  return respond(input, reason, { stdout, stderr });
}

export function isMain(url) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === url;
}

export function executable(token) {
  return token?.split(/[\\/]/).at(-1).replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
}

export function windowsInput(input) {
  return process.platform === 'win32'
    || /^(powershell|pwsh|cmd)(?:\.exe)?$/i.test(executable(input.shell))
    || /^(?:[a-z]:|\\\\)/i.test(input.cwd ?? '')
    || /(?:[a-z]:\\|\\\\[^\\\s]+\\)/i.test(input.command ?? '');
}

// Deliberately parse only literal shell words. No expansion or shell execution.
// Unsupported syntax returns null, making both hooks fail open.
export function shellCommands(command, { windows = process.platform === 'win32' } = {}) {
  const commands = [];
  let words = [];
  let word = '';
  let started = false;
  let quote = null;
  const pushWord = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  const pushCommand = () => {
    pushWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (char === quote) {
        // Doubled single quotes are ambiguous between PowerShell and Bash.
        if (quote === "'" && command[i + 1] === "'") return null;
        quote = null;
      } else if (quote === '"' && /[$`%]/.test(char)) return null;
      else if (!windows && quote === '"' && char === '\\' && /["\\$`]/.test(command[i + 1] ?? '')) {
        word += command[++i];
      } else word += char;
      continue;
    }
    if (/[$`%()<>^]/.test(char) || (char === '@' && /['"]/.test(command[i + 1] ?? ''))) return null;
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (!windows && char === '\\') {
      if (i + 1 === command.length) return null;
      const next = command[i + 1];
      if (next === '\n') i++;
      else if (/[\s'"\\;&|]/.test(next)) { word += next; i++; started = true; }
      else { word += char; started = true; }
    } else if (/[;&|\n]/.test(char)) pushCommand();
    else if (/\s/.test(char)) pushWord();
    else if (char === '#' && !started) {
      while (i < command.length && command[i] !== '\n') i++;
      pushCommand();
    } else { word += char; started = true; }
  }
  if (quote) return null;
  pushCommand();
  return commands;
}
