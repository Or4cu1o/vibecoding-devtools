import { statSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve, dirname, win32 } from 'node:path';
import { executable, isMain, runHook, shellCommands, windowsInput } from './lib/io.mjs';

export const FULL_SUITE_REASON = 'CI runs the full suite; run only the tests for what you changed. If the full run is intended, repeat the command with VIBECODING_FULL_SUITE=1 in it.';

// Only known non-filtering options are accepted. Unknown options may select tests.
function optionsOnly(args, booleans = [], values = []) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') return i === args.length - 1;
    if (booleans.includes(arg)) continue;
    if (values.includes(arg)) {
      if (!args[++i] || args[i].startsWith('-')) return false;
      continue;
    }
    if (values.some(flag => arg.startsWith(`${flag}=`) && arg.length > flag.length + 1)) continue;
    return false;
  }
  return true;
}

export function isFullSuite(words) {
  words = [...words];
  while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(words[0] ?? '')) words.shift();
  if (executable(words[0]) === 'env') {
    words.shift();
    while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(words[0] ?? '')) words.shift();
  }
  const tool = executable(words.shift());
  if (tool === 'node' && words[0] === '--test') {
    return optionsOnly(words.slice(1), [], ['--test-reporter']);
  }
  if (tool === 'pytest' || tool === 'py.test') {
    return optionsOnly(words, ['-q', '-qq', '-v', '-vv', '-s', '-x', '--verbose', '--quiet', '--exitfirst', '--disable-warnings', '--no-header', '--no-summary'], ['--maxfail', '--tb', '--color']);
  }
  if (['python', 'python3', 'py'].includes(tool) && words[0] === '-m' && words[1] === 'pytest') {
    return isFullSuite(words.slice(1));
  }
  if (['npm', 'pnpm', 'yarn'].includes(tool)) {
    if (words[0] === 'run') words.shift();
    if (words.shift() !== 'test') return false;
    if (words[0] === '--') words.shift();
    return optionsOnly(words, ['--silent', '--verbose', '--runInBand', '--ci', '--coverage', '--watch=false', '--watchAll=false']);
  }
  if (tool === 'npx') return ['vitest', 'jest'].includes(executable(words[0])) && isFullSuite(words);
  if (tool === 'vitest' || tool === 'jest') {
    if (tool === 'vitest' && words.shift() === 'run') {
      return optionsOnly(words, ['--coverage', '--silent', '--no-color'], ['--reporter']);
    }
    if (tool === 'jest') {
      return optionsOnly(words, ['--runInBand', '--ci', '--coverage', '--silent', '--verbose', '--watch=false', '--watchAll=false', '--no-cache'], ['--maxWorkers']);
    }
    return false;
  }
  if (tool === 'go' && words.shift() === 'test') {
    if (words.filter(word => word === './...').length !== 1) return false;
    return optionsOnly(words.filter(word => word !== './...'), ['-v', '-race', '-cover', '-short', '-count=1'], ['-count', '-timeout', '-parallel']);
  }
  if (tool === 'cargo' && words.shift() === 'test') {
    return optionsOnly(words, ['--workspace', '--all', '--all-targets', '--all-features', '--no-default-features', '--release', '--locked', '--offline', '--quiet', '-q', '--verbose', '-v']);
  }
  return false;
}

function exists(path, kind, fs) {
  try { return fs.statSync(path)[kind](); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false;
    throw error;
  }
}

const pathApi = cwd => win32.isAbsolute(cwd) && !cwd.startsWith('/') ? win32 : { resolve, dirname };

function repositoryRoot(cwd, fs) {
  const paths = pathApi(cwd);
  if (!exists(cwd, 'isDirectory', fs)) return false;
  let directory = paths.resolve(cwd);
  while (true) {
    if (exists(paths.resolve(directory, '.git'), 'isDirectory', fs)
        || exists(paths.resolve(directory, '.git'), 'isFile', fs)) return directory;
    const parent = paths.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function hasCI(directory, fs) {
  const paths = pathApi(directory);
  const workflows = paths.resolve(directory, '.github', 'workflows');
  if (exists(workflows, 'isDirectory', fs)
      && fs.readdirSync(workflows).some(file => /\.ya?ml$/i.test(file)
        && exists(paths.resolve(workflows, file), 'isFile', fs))) return true;
  if (['.gitlab-ci.yml', 'azure-pipelines.yml'].some(file => exists(paths.resolve(directory, file), 'isFile', fs))
      || exists(paths.resolve(directory, '.circleci'), 'isDirectory', fs)) return true;
  return false;
}

function packageSuite(words, cwd, windows, fs) {
  // Scripts are data, never executed. Wrappers, chained scripts and lifecycle
  // scripts leave scope uncertain, so only one supported literal runner denies.
  const packageJson = JSON.parse(fs.readFileSync(pathApi(cwd).resolve(cwd, 'package.json'), 'utf8'));
  const scripts = packageJson?.scripts;
  if (typeof scripts?.test !== 'string' || scripts.pretest || scripts.posttest) return false;
  const commands = shellCommands(scripts.test, { windows });
  if (commands?.length !== 1) return false;
  const script = commands[0];
  const runner = executable(script[0]);
  if (['npm', 'pnpm', 'yarn', 'env'].includes(runner) || /^[A-Za-z_][A-Za-z_0-9]*=/.test(script[0])) return false;
  let args = words.slice(1);
  if (args[0] === 'run') args.shift();
  args.shift(); // test
  if (args[0] === '--') args.shift();
  return isFullSuite([...script, ...args]);
}

export function checkFullSuite(input, { fs = { statSync, readdirSync, readFileSync } } = {}) {
  try {
    if (typeof input.command !== 'string') return;
    if (typeof input.cwd !== 'string' || !(isAbsolute(input.cwd) || win32.isAbsolute(input.cwd))) return;
    if (/^\\(?!\\)/.test(input.cwd)
        || (/^\\\\/.test(input.cwd) && !/^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(input.cwd))) return;
    const windows = windowsInput(input);
    // Normalize only literal PowerShell override assignments. Other expansion
    // remains unsupported and fails open in the shared parser.
    const literal = input.command.replace(/(^|[;\n])\s*\$env:VIBECODING_FULL_SUITE\s*=\s*(?:'([0-9]+)'|"([0-9]+)"|([0-9]+))(?=\s*(?:[;\n]|$))/g,
      (_, boundary, single, double, bare) => `${boundary} VIBECODING_FULL_SUITE=${single ?? double ?? bare}`);
    const commands = shellCommands(literal, { windows });
    if (!commands) return;
    for (const words of commands) {
      if (executable(words[0]) === 'set' && words.length === 2 && /^VIBECODING_FULL_SUITE=[0-9]+$/.test(words[1])) words.shift();
    }
    if (commands.some(words => words.includes('VIBECODING_FULL_SUITE=1'))) return;
    if (commands.some(words => ['cd', 'chdir', 'set-location', 'push-location', 'pop-location', 'sl', 'pushd', 'popd', 'export', 'set', 'unset', 'source', '.']
      .includes(executable(words[0])))) return;
    const candidates = commands.filter(isFullSuite);
    if (!candidates.length) return;
    const root = repositoryRoot(input.cwd, fs);
    // A runner below the repository root may cover only one monorepo package.
    if (!root || root !== pathApi(input.cwd).resolve(input.cwd) || !hasCI(root, fs)) return;
    for (const words of candidates) {
      // Strip literal environment prefixes consistently before inspecting scripts.
      const invocation = [...words];
      while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(invocation[0] ?? '')) invocation.shift();
      if (executable(invocation[0]) === 'env') {
        invocation.shift();
        while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(invocation[0] ?? '')) invocation.shift();
      }
      if (!['npm', 'pnpm', 'yarn'].includes(executable(invocation[0]))
          || packageSuite(invocation, input.cwd, windows, fs)) return FULL_SUITE_REASON;
    }
  } catch { /* Uncertain commands or inaccessible repository metadata allow. */ }
}

if (isMain(import.meta.url)) process.exitCode = await runHook(checkFullSuite);
