import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve, win32 } from 'node:path';
import { executable, isMain, runHook, shellCommands, windowsInput } from './lib/io.mjs';

const scanFlags = ['--redact', '--no-banner', '--exit-code', '99'];
export const GITLEAKS_ARGS = ['git', '--pre-commit', '--staged', ...scanFlags];
const leakReason = 'Commit blocked: changes that can enter the commit contain secrets. Remove them before committing.';
const warning = 'Secret scan unavailable; allowing command.\n';

function commitDirectory(words, cwd, windows) {
  if (executable(words[0]) !== 'git') return null;
  let directory = cwd;
  for (let i = 1; i < words.length; i++) {
    const arg = words[i];
    if (arg === 'commit') return directory;
    if (arg === '-C' || arg.startsWith('-C')) {
      const value = arg === '-C' ? words[++i] : arg.slice(2);
      if (value === undefined) return null;
      // A drive-relative or incomplete UNC path cannot be resolved safely from
      // the supplied cwd. Never let Node fill in another drive's process cwd.
      if (windows && (/^[a-z]:(?![\\/])/i.test(value)
          || (/^\\\\/.test(value) && !/^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(value))
          || (/^\\(?!\\)/.test(value) && !/^[a-z]:/i.test(directory)))) return null;
      directory = /^(?:[a-z]:[\\/]|\\\\)/i.test(directory) || /^(?:[a-z]:[\\/]|\\\\)/i.test(value)
        ? win32.resolve(directory, value) : resolve(directory, value);
    } else if (arg === '-c' || arg === '--config-env') {
      if (words[++i] === undefined) return null;
    } else if (arg.startsWith('-c') || arg.startsWith('--config-env=')
        || ['--no-pager', '--paginate', '--literal-pathspecs', '--no-optional-locks', '--bare'].includes(arg)) {
      continue;
    } else return null;
  }
  return null;
}

export function checkSecretScan(input, { runner = spawnSync, stderr = process.stderr } = {}) {
  const windows = windowsInput(input);
  const commands = shellCommands(input.command, { windows });
  if (!commands) return;
  // Earlier commands can change repository selection. Without evaluating their
  // control flow, the effective cwd/environment cannot be established reliably.
  if (commands.some(words => ['cd', 'chdir', 'set-location', 'pushd', 'popd', 'export', 'set', 'unset']
    .includes(executable(words[0])))) return;
  if (typeof input.cwd !== 'string' || !(isAbsolute(input.cwd) || win32.isAbsolute(input.cwd))) return;
  if (windows && (/^\\(?!\\)/.test(input.cwd)
      || (/^\\\\/.test(input.cwd) && !/^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(input.cwd)))) return;
  let warned = false;
  const warn = () => {
    if (!warned) {
      stderr.write(warning);
      warned = true;
    }
  };
  const run = (command, args, cwd) => {
    try {
      return runner(command, args, {
        cwd, encoding: 'utf8', stdio: 'pipe', timeout: 5000, windowsHide: true,
      });
    } catch { return undefined; }
  };
  const scan = (args, cwd) => {
    const result = run('gitleaks', args, cwd);
    if (!result?.error && !result?.signal && result?.status === 99) return true;
    if (result?.error || result?.signal || result?.status !== 0) warn();
    return false;
  };
  for (const words of commands) {
    const cwd = commitDirectory(words, input.cwd, windows);
    if (!cwd) continue;
    if (scan([...GITLEAKS_ARGS], cwd)) return leakReason;
    if (scan(['git', '--pre-commit', ...scanFlags], cwd)) return leakReason;
    const listing = run('git', ['ls-files', '--others', '--exclude-standard', '-z'], cwd);
    if (listing?.error || listing?.signal || listing?.status !== 0 || typeof listing?.stdout !== 'string') {
      warn();
      continue;
    }
    // NUL delimiters preserve spaces, quotes and newlines in Git filenames.
    if (listing.stdout && !listing.stdout.endsWith('\0')) { warn(); continue; }
    for (const file of listing.stdout.split('\0').filter(Boolean)) {
      const paths = win32.isAbsolute(cwd) && !cwd.startsWith('/') ? win32 : { resolve, isAbsolute };
      const target = paths.resolve(cwd, file);
      // Git lists relative files. Reject unexpected absolute/traversal output.
      if (paths.isAbsolute(file) || /^[a-z]:/i.test(file)
          || file.split(/[\\/]/).includes('..')) { warn(); continue; }
      if (scan(['dir', target, ...scanFlags], cwd)) return leakReason;
    }
  }
}

if (isMain(import.meta.url)) process.exitCode = await runHook(checkSecretScan);
