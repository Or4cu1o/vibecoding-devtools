# CLI compatibility

How Claude Code, Codex and Antigravity load instructions, rules, skills, hooks and agents. Claude Code is the source;
the installer converts for the other two based on this table.

Verified on 2026-10-29 with Claude Code 2.1.302, Codex 0.164.0 and Antigravity CLI 1.4.9. **Review this file:** whenever
a new version of a CLI changes loading, hooks or plugins.

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
| Windows shell | Git Bash (PowerShell without it) | undocumented; use `commandWindows` | `cmd /c` |
| Execution folder | project folder (`${CLAUDE_PROJECT_DIR}`) | session folder | `hooks.json` folder |
| Default timeout | 600 s | 600 s | 30 s |
| User approval | no | **yes, in `/hooks`; every change requires approval again** | no |

- All three block a shell command before execution. A single Node script serves all three if it recognizes the input
  format and responds in each one's format.
- In Codex, a hook that hangs, times out or returns invalid output **does not block**; `ask` is unsupported.
- Antigravity has no `UserPromptSubmit`, `SessionEnd` or `PreCompact`.

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

- Shell Codex uses for hook `command` on Windows.
- Antigravity editing tool names (only `run_command` is documented) and the effect of exit codes in its hooks.
- Antigravity CLI global folder: local docs and this machine use `~/.gemini/config/`; the website mentions
  `~/.gemini/antigravity-cli/`.

## Sources

- Claude Code: `code.claude.com/docs/en/` (`memory`, `skills`, `hooks`, `plugins`, `sub-agents`, `setup`).
- Codex: `learn.chatgpt.com/docs/` (`agents-md`, `rules`, `build-skills`, `hooks`, `codex/cli`) and `codex --help`.
- Antigravity: the CLI's bundled `agy-customizations` skill, `antigravity.google/docs/` (`rules`, `skills`, `hooks`,
  `plugins`, `subagents`) and `agy --help`.
