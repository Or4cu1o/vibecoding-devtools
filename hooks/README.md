# Hooks

Two `PreToolUse` hooks are implemented in Node 22+, without dependencies. Each script serves Claude Code, Codex and
Antigravity, reading JSON from stdin and responding in the CLI's format. Neither injects prompt text.

## Implemented

- **[Secret scan](secret-scan.mjs):** detects literal `git commit` commands, including `git -C <dir> commit` and chained
  commands. Runs gitleaks with redaction on staged changes, working-tree changes and untracked files, covering changes
  that may be staged by the command. Confirmed leaks block with a short reason that contains no secret values.
- **[Maestri protocol](maestri-protocol.mjs):** checks literal `maestri ask` messages, including every `--batch` value;
  skips `--raw`. Reports starting with `~` need the first-line header
  `~ <Name> | <STATUS> | <ref> | <summary>`, with status DONE, PENDING, BLOCKED, ERROR, ACK or ASK. Other messages must
  end with the full delegation footer from the `maestri-protocol` skill. Invalid messages block with a short reason.
  Installed only with the Maestri pack.

## Installation and registration

The installer copies `hooks/` to `~/.vibecoding-devtools/hooks/` and runs each script with Node. Secret scanning is on
by default; the panel and `--hooks` flag control kit hooks. The protocol hook also requires the Maestri pack.

- **Claude Code:** `~/.claude/settings.json`, `hooks.PreToolUse`, matcher `Bash|PowerShell`, timeout 30 seconds.
- **Codex:** `~/.codex/hooks.json`, `hooks.PreToolUse`, matcher `Bash`, with `commandWindows`. The user must approve
  hooks in `/hooks`; every hook change requires approval again.
- **Antigravity:** `~/.gemini/config/hooks.json`, entries `vibecoding-secret-scan` and `vibecoding-maestri-protocol`,
  `enabled: true`, `PreToolUse`, matcher `run_command`, timeout 30 seconds.

Registration merges into existing JSON and uninstall removes only the kit's entries, preserving user content.
See [installer details](../docs/installer.md#hooks) and [CLI formats](../docs/cli-compatibility.md#hooks).

## Limits

- Hooks never block on their own uncertainty: unknown input, invalid JSON, unsupported shell syntax, variables and
  here-strings are allowed when they cannot be interpreted reliably. They parse literal commands without executing them.
- Missing or failing gitleaks only produces a one-line warning on stderr and allows the command.
- Secret scanning uses the supplied working directory and literal `git -C` paths. Antigravity's directory comes from
  `toolCall.args.Cwd`, never the hook process directory. Uncertain directories or repository-changing commands are
  allowed without scanning.
- Scanning happens before the shell command runs. Working-tree and untracked scans may flag files outside the eventual
  commit; files created or changed later in the command are not covered.
- Claude Code and Codex deny with exit 2 and a reason on stderr. Antigravity denies with JSON on stdout and returns
  `{}` on allow. Messages never include secret values or the original command's contents.

## Ideas to evaluate

These two hooks are not implemented. Inclusion criterion: low cost per execution, without injecting prompt text.

1. **Full local suite** (`PreToolUse` on Bash): warns when the agent runs the entire suite (`pytest` without a path,
   `pnpm test` without a filter) in a repository with CI, reminding it to test only what changed.
2. **Test ratio** (before push): compares test and production lines in the diff. Above a threshold, warns that a Low-
   or Medium-risk item may have too many tests.
