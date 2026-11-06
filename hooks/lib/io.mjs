import { resolve, isAbsolute, win32 } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseInput(text) {
  try {
    const input = JSON.parse(text);
    if (typeof input?.toolCall?.name === 'string') {
      const args = input.toolCall.args;
      // 1.5.2 omits Cwd when using the sole workspace as the default directory.
      // Multiple workspaces or invalid paths do not establish a safe default.
      const workspace = Array.isArray(input.workspacePaths) && input.workspacePaths.length === 1
        ? input.workspacePaths[0] : undefined;
      const defaultCwd = typeof workspace === 'string' && (isAbsolute(workspace) || win32.isAbsolute(workspace))
        ? workspace : undefined;
      return { cli: 'antigravity', command: input.toolCall.name === 'run_command'
        && typeof args?.CommandLine === 'string' ? args.CommandLine : undefined,
        cwd: args?.Cwd === undefined ? defaultCwd : args.Cwd, shell: args?.Shell ?? input.shell };
    }
    if (['Bash', 'PowerShell'].includes(input?.tool_name)
        && typeof input?.tool_input?.command === 'string') {
      // turn_id is a Codex-specific PreToolUse field; Claude also reports Bash.
      return { cli: typeof input.turn_id === 'string' ? 'codex' : 'claude-codex',
        command: input.tool_input.command, cwd: input.cwd,
        shell: input.tool_name === 'PowerShell' ? 'PowerShell' : input.shell };
    }
  } catch { /* Invalid JSON is an uncertain input, so allow it. */ }
  return null;
}

export function respond(input, reason, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (input?.cli === 'antigravity') {
    stdout.write(`${JSON.stringify(reason ? { decision: 'deny', reason } : { decision: 'allow' })}\n`);
    return 0;
  }
  if (input && reason) {
    if (input.cli === 'codex') {
      // PowerShell -Command maps a native exit 2 to exit 1. JSON denial with
      // success survives that wrapper and is supported by Codex PreToolUse.
      stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse',
        permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`);
      return 0;
    }
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
    if (typeof input?.command === 'string') reason = await check(input, { stderr });
  } catch { /* A hook must never deny because of its own failure. */ }
  return respond(input, reason, { stdout, stderr });
}

export function isMain(url) {
  if (!process.argv[1]) return false;
  let entryPath = resolve(process.argv[1]);
  try { entryPath = realpathSync(entryPath); } catch { /* Keep the resolved path if it cannot be read. */ }
  return pathToFileURL(entryPath).href === url;
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
// Unsupported syntax returns null, making hooks fail open.
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
    if (/[$`%(){}<>^]/.test(char) || (char === '@' && /['"]/.test(command[i + 1] ?? ''))) return null;
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
  // Literal command lists do not model shell blocks or conditional execution.
  if (commands.some(words => /^(?:if|then|else|elif|fi|for|foreach|while|do|done|until|switch|case|esac|function|filter|try|catch|finally|begin|process|end|trap|class)$/i.test(words[0]))) return null;
  return commands;
}
