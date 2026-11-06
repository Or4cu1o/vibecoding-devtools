# CLI compatibility

How Claude Code, Codex and Antigravity load instructions, rules, skills, hooks and agents. Claude Code is the source;
the installer converts for the other two based on this table.

Verified on 2026-10-29 with Claude Code 2.1.302, Codex 0.164.0 and Antigravity CLI 1.4.9. **Review this file:** whenever
a new version of a CLI changes loading, hooks or plugins. The Antigravity hook contract was reverified on
2026-11-06 with CLI 1.5.2. The Codex Windows hook shell was verified with
0.167.0 on the same date using an isolated `CODEX_HOME`.

## Binary and installation

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Binary | `claude` | `codex` | `agy` |
| Version | `claude --version` | `codex --version` | `agy --version` |
| Diagnostics | `claude doctor` | `codex doctor` | — |
| Install (macOS, Linux) | `curl -fsSL https://claude.ai/install.sh \| bash` | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` |
| Install (Windows) | `irm https://claude.ai/install.ps1 \| iex` | `irm https://chatgpt.com/codex/install.ps1 \| iex` | `irm https://antigravity.google/cli/install.ps1 \| iex` |
| Binary folder (Unix) | `~/.local/bin` | `~/.local/bin` | `~/.local/bin` |
| Binary folder (Windows) | `%USERPROFILE%\.local\bin` | `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` | `%LOCALAPPDATA%\agy\bin` |
| Configuration folder | `~/.claude/` | `~/.codex/` (`CODEX_HOME`) | `~/.gemini/config/` and `~/.gemini/antigravity-cli/` |

None of the three bundles Node or Python. After installation, check that the binary folder is in `PATH`.

To point a CLI at another configuration folder (for example, a test home), use its variable: on Windows, Codex ignores
`HOME` and `USERPROFILE` and follows only `CODEX_HOME` (verified with 0.166); for Claude Code, `CLAUDE_CONFIG_DIR`.

## Instruction file

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Reads | `CLAUDE.md`; `AGENTS.md` only when no `CLAUDE.md` exists | `AGENTS.md` (`AGENTS.override.md` wins) | `AGENTS.md` and `GEMINI.md` |
| Reads `CLAUDE.md` | yes | no | no |
| Global | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.gemini/AGENTS.md`, `~/.gemini/config/AGENTS.md` |
| Project | root and ancestors; subfolders when touching their files | git root to current folder, one file per folder | from folders of the active file to root |
| Import another file | `@path` | — | `@[label](path)` |
| Limit | recommended < 200 lines | **32 KiB across all files** (`project_doc_max_bytes`) | 24,000 bytes per file |

**Kit pattern:** `AGENTS.md` is the project's single source and `CLAUDE.md` contains only `@AGENTS.md` (on Windows, use
the import, not a symbolic link).

## Rules

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Global folder | `~/.claude/rules/**/*.md` | none | `~/.gemini/config/rules/*.md` |
| Project folder | `.claude/rules/**/*.md` | none | `.agents/rules/*.md` (first level only) |
| Always active | no frontmatter | — | `trigger: always_on` |
| Active by file | `paths:` (glob list) | — | `trigger: glob` + `globs:` (comma-separated text) |
| Missing frontmatter | always loads | — | **file silently discarded** |

- **Antigravity conversion:** rules without `paths:` get `trigger: always_on`; those with `paths:` become
  `trigger: glob` and `globs:`. ECC is not installed on Antigravity: no ECC commands, rules or package flattening.
- **Codex conversion:** no rules folder. Always applicable rules enter a marked `AGENTS.md` block; large rules become
  routing table rows ("if the task involves X, read Y"), within the 32 KiB limit. ECC retains its plugin and routed
  rules from the `common` package. Impeccable remains available on all three CLIs.
- In Codex, "rules" (`~/.codex/rules/*.rules`, Starlark) are command policies: `prefix_rule(...)` with
  `decision="forbidden"` blocks one command at a time. Useful for hard prohibitions such as `git push --force`.

## Skills

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Global | `~/.claude/skills/<name>/` | `~/.agents/skills/<name>/` | `~/.gemini/config/skills/<name>/` |
| Project | `.claude/skills/<name>/` | `.agents/skills/<name>/` | `.agents/skills/<name>/` |
| Portable frontmatter | `name`, `description` | `name`, `description` | `name`, `description` |
| `references/`, `scripts/` | yes | yes | yes |

The same `SKILL.md` works on all three. Fields beyond `name` and `description` (such as `user-invocable`) apply only to
Claude Code and are ignored by the others. In projects, Codex and Antigravity read the same `.agents/skills/`.

## Hooks

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Global file | `~/.claude/settings.json` | `~/.codex/hooks.json` | `~/.gemini/config/hooks.json` |
| Project file | `.claude/settings.json` | `.codex/hooks.json` (trusted projects only) | `.agents/hooks.json` |
| Format | `{"hooks":{"PreToolUse":[{"matcher","hooks":[...]}]}}` | same as Claude Code | `{"<name>":{"enabled":true,"PreToolUse":[...]}}` |
| Shell tool | `Bash` | `Bash` | `run_command` |
| Command received in | `tool_input.command` | `tool_input.command` | `toolCall.args.CommandLine` |
| Block | exit 2 (reason on stderr) or `permissionDecision: "deny"` | exit 2 or `permissionDecision: "deny"` | stdout `{"decision":"deny","reason":"..."}` |
| Allow | exit 0 | exit 0 | stdout `{"decision":"allow"}`, exit 0 |
| Windows shell | Git Bash (PowerShell without it) | Windows PowerShell (`powershell.exe`), verified on 0.167.0 | `cmd /c` |
| Execution folder | project folder (`${CLAUDE_PROJECT_DIR}`) | session folder | `hooks.json` folder |
| Default timeout | 600 s | 600 s | 30 s |
| User approval | no | **yes, in `/hooks`; every change requires approval again** | no |

- All three block a shell command before execution. A single Node script serves all three if it recognizes the input
  format and responds in each one's format.
- In Codex, a hook that hangs, times out or returns invalid output **does not block**; `ask` is unsupported.
- The kit identifies Codex `PreToolUse` input by its documented `turn_id` extension and denies with stdout JSON:
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`,
  exiting 0. Allow returns exit 0 with no output. This applies to project and global hooks. Claude Code retains exit 2
  and a reason on stderr; its `Bash` input alone does not identify Codex.
- Codex 0.167.0 on Windows launches hooks through PowerShell: a diagnostic `SessionStart` hook in an isolated
  `CODEX_HOME` observed `powershell.exe` as its parent. `powershell.exe -NoProfile -Command` maps a native exit 2
  to exit 1, so exit-code-only denial becomes a hook failure that permits the tool call. Regression tests run the
  registered project and global `commandWindows` strings through that shell and assert JSON denial with exit 0.
  The hook command strings remain unchanged; the runtime response fixes the failure.
- In Antigravity, a failing hook **blocks the tool call**, including a Node startup failure. On Windows, `cmd /c`
  runs hooks from the `hooks.json` folder. Use unquoted relative script paths with forward slashes and no spaces;
  quoted absolute paths can reach Node with literal quotes and prevent the script from loading.
- Antigravity has no `UserPromptSubmit`, `SessionEnd` or `PreCompact`.

Antigravity 1.5.2 `PreToolUse` requires an explicit `decision`: return `allow` to proceed, or `deny` with a nonempty
`reason` to block. An empty object is a `PostToolUse` response; using it for `PreToolUse` denied even harmless commands
with an empty reason in the live session. Both allow and deny responses use stdout JSON and exit 0.

The captured 1.5.2 payload uses camelCase system metadata and `toolCall.name` / `toolCall.args.CommandLine`. It omitted
`Cwd` for the default workspace and provided a single absolute path in `workspacePaths`. The hooks prefer explicit
`Cwd`, otherwise use that sole absolute workspace. Missing or multiple workspace paths leave the directory unknown;
the process working folder is never used as a substitute. Unknown Antigravity tools and malformed command arguments
explicitly allow without checking a command. The existing 1.4.9 payload with explicit `Cwd` remains supported.

Project-scope kit hooks live in the repository's `.vibecoding-devtools/hooks/`, including shared helpers. Their
registrations use the project files above and contain no machine-specific paths. Commit these files so the whole team
gets the hooks on clone; each Codex user must still trust the project and approve its hooks in `/hooks`.

- Claude Code project commands use `CLAUDE_PROJECT_DIR` to locate the repository runtime.
- [Codex hooks run in the session working folder](https://learn.chatgpt.com/docs/hooks), even when it is below the Git
  root. The installer uses a portable Node launcher that resolves the Git root, passes stdin to the hook and returns
  its exit code. `commandWindows` uses the same launcher. Project `.codex/` layers must be trusted to load hooks.
- Antigravity project commands use `node ../.vibecoding-devtools/hooks/<name>.mjs` from `.agents/`, with forward slashes
  and no quotes. Global hooks keep their existing home locations.

## Custom agents

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Folder | `.claude/agents/*.md`, `~/.claude/agents/` | `.codex/agents/*.toml`, `~/.codex/agents/` | `.agents/agents/*.md`, `~/.gemini/config/agents/` |
| Format | Markdown + frontmatter (`name`, `description`, `tools`, `model`) | TOML (`name`, `description`, `developer_instructions`) | Markdown + frontmatter (`name`, `description`, `tools`, `model`) |

## Plugins

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Loads rules | no | no | yes |
| Install | `claude plugin install <p>@<mkt>` | `codex plugin add <p>@<mkt>` | `agy plugin install <target>` |

The kit is not distributed as a plugin: rules cannot be bundled in Claude Code or Codex plugins. Installation uses the
installer.

## Unconfirmed points

- Antigravity editing tool names (only `run_command` is documented).
- Antigravity CLI global folder: local docs and this machine use `~/.gemini/config/`; the website mentions
  `~/.gemini/antigravity-cli/`.

## Sources

- Claude Code: `code.claude.com/docs/en/` (`memory`, `skills`, `hooks`, `plugins`, `sub-agents`, `setup`).
- Codex: `learn.chatgpt.com/docs/` (`agents-md`, `rules`, `build-skills`, `hooks`, `codex/cli`) and `codex --help`.
- Antigravity: the CLI's bundled `agy-customizations` skill, `antigravity.google/docs/` (`rules`, `skills`, `hooks`,
  `plugins`, `subagents`) and `agy --help`.
