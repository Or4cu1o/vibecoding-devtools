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

The installer copies the scripts and their `lib/` helpers to `~/.vibecoding-devtools/hooks/` globally, or to the
repository's `.vibecoding-devtools/hooks/` in project scope, and runs each script with Node. Secret scanning is on by
default; the panel and `--hooks` flag control kit hooks. The protocol hook also requires the Maestri pack.

- **Claude Code:** `~/.claude/settings.json`, `hooks.PreToolUse`, matcher `Bash|PowerShell`, timeout 30 seconds.
- **Codex:** `~/.codex/hooks.json`, `hooks.PreToolUse`, matcher `Bash`, with `commandWindows`. The user must approve
  hooks in `/hooks`; every hook change requires approval again.
- **Antigravity:** `~/.gemini/config/hooks.json`, entries `vibecoding-secret-scan` and `vibecoding-maestri-protocol`,
  `enabled: true`, `PreToolUse`, matcher `run_command`, timeout 30 seconds.

Registration merges into existing JSON and uninstall removes only the kit's entries, preserving user content.
In project scope, register in `.claude/settings.json`, `.codex/hooks.json` and `.agents/hooks.json` instead of the home
files above. Commit the scripts, helpers and registrations so everyone who clones the repository gets the same hooks.
Each Codex user still trusts the project and approves the hooks in `/hooks`, including after changes.

Project commands contain no absolute paths: Claude Code uses `CLAUDE_PROJECT_DIR`; Codex uses a Node launcher that
finds the Git root from the session folder and forwards stdin and the hook exit code. This supports nested session
folders on Windows, macOS and Linux. Antigravity runs `node ../.vibecoding-devtools/hooks/<name>.mjs` from `.agents/`,
using forward slashes and no quotes. A failing Antigravity hook blocks the tool call, including a Node startup failure.

Update migrates unchanged tracked project hooks from the home into the repository and preserves edited items with
warnings or conflicts. Update also removes dropped runtime files; uninstall removes unchanged tracked project scripts
and registrations. Global scope keeps its existing locations and commands.
See [installer details](../docs/installer.md#hooks) and [CLI formats](../docs/cli-compatibility.md#hooks).

## Limits

- Hooks never block on their own uncertainty: unknown input, invalid JSON, unsupported shell syntax, variables and
  here-strings are allowed when they cannot be interpreted reliably. They parse literal commands without executing them.
- Missing or failing gitleaks only produces a one-line warning on stderr and allows the command.
- Secret scanning uses the supplied working directory and literal `git -C` paths. Antigravity's directory comes from
  `toolCall.args.Cwd`, or its sole absolute `workspacePaths` entry when `Cwd` is omitted in 1.5.2. It never uses the
  hook process directory. Uncertain directories or repository-changing commands are allowed without scanning.
- Scanning happens before the shell command runs. Working-tree and untracked scans may flag files outside the eventual
  commit; files created or changed later in the command are not covered.
- Claude Code denies with exit 2 and a reason on stderr. Codex input includes `turn_id`; it denies with stdout JSON
  `hookSpecificOutput.permissionDecision: "deny"` and `permissionDecisionReason`, exiting 0 so Windows PowerShell
  cannot turn a native exit 2 into a hook failure. Codex allows with exit 0 and no output. Antigravity returns
  stdout JSON with `decision: deny`
  and a nonempty `reason`, or `decision: allow` on allow, both with exit 0. `PreToolUse` must not return an empty
  object:
  Antigravity 1.5.2 treats it as a denial with an empty reason. Messages never include secret values or the original
  command's contents.

## In progress

**Full local suite:** Ponte is implementing a soft block for full-suite commands in repositories with CI, such as
`pytest` without a path or `pnpm test` without a filter. The agent can deliberately bypass the block by including
`VIBECODING_FULL_SUITE=1` in the command. This hook is not yet implemented.

## Dropped

**Test ratio:** the owner dropped this idea. A hook cannot know the task's risk level, so a test-to-production line
threshold would also flag High-risk work, where more tests are expected.
