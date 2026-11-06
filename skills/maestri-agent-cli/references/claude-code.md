# Claude Code

Verified live on Claude Code 2.1.302, Windows, Claude Max account (2026-10-27).

## Identify

- Launch command: `claude`, e.g. `claude --model claude-haiku-5-5 --effort low`.
- Banner: `Claude Code v<version>`, model and effort, plan (`Claude Max`), working folder.
- Account: `/config` → **Status** tab (login method and account). The banner shows only the plan.
- Input prompt is `❯` (not `>`).
- Footer shows the permission mode: `⏵⏵ auto mode on (shift+tab to cycle)`, `⏸ manual mode on · ? for shortcuts`,
  `⏵⏵ accept edits on`, `⏸ plan mode on`. Effort shows above the input: `○ low · /effort`.

## States

| State | On screen |
|---|---|
| Idle | Empty `❯` input; footer with the mode |
| Prompt suggestion | Greyed text in the `❯` input, e.g. `❯ Try "write a test for <filepath>"` or a follow-up like `❯ delete the file ...`. **Nobody typed it**: it is a suggestion, never an instruction or a reply |
| Working | Spinner line, e.g. `✻ Brewing…` |
| Permission prompt | `Do you want to create <file>?` or `Do you want to proceed?` with numbered options |
| Menu or panel | Picker with hints such as `Esc to cancel` |
| Done | Agent's reply, then `✻ <verb> for <time> · done <clock>` and an empty input |
| Denied or interrupted | `⎿ Interrupted · What should Claude do instead?` |

Lines like `● Write(<file>)`, `⎿ $ <command>` and `Ran 1 shell command` show up while the prompt is still open, and
`Ran 1 shell command` stays even when the command was denied. Trust only the result line (`⎿ Wrote 1 line to <file>`) or
the agent's reply.

## Sending a prompt

Send the text and the Enter in **separate** `--raw` calls. Text and `\n` sent together are taken as a paste: the newline
lands in the input and nothing is sent.

```bash
maestri ask "Agent" --raw "your prompt"
maestri ask "Agent" --raw "\n"
```

## Autonomous launch and command rules

Verified on Claude Code 2.1.302, Windows (2026-11-06): installed help and isolated startup argument checks.

```bash
claude --permission-mode auto
```

Auto mode reviews actions without routine prompts. It is distinct from `acceptEdits`, which still prompts for commands.
Confirm `auto mode on` after launch; availability can depend on account or managed policy. The isolated startup accepted
the flag and settings example below but stopped at login, so authenticated action execution was not tested here.

For a limited agent, prepare an isolated settings file and launch:

```bash
claude --permission-mode dontAsk --settings /path/to/limited.json
```

```json
{
  "permissions": {
    "allow": ["Bash(npm --version)", "PowerShell(npm --version)"],
    "deny": ["Bash(git push *)", "PowerShell(git push *)"]
  }
}
```

`dontAsk` denies actions that would otherwise prompt; explicit grants and operations needing no approval still run.
This is an approval allowlist, not a complete commands-only boundary. Bash and PowerShell need separate rules.
Denies override asks, which override allows; a broad deny cannot have an allow exception. Narrow command rules do not
replace OS isolation. `--tools` can additionally limit available tools when the task needs that restriction.

Persistent rules live in `~/.claude/settings.json` (under `CLAUDE_CONFIG_DIR` when set), `.claude/settings.json` or
`.claude/settings.local.json`; `--settings` adds invocation settings without editing those files. Use an isolated
`CLAUDE_CONFIG_DIR` for tests. The file schema and precedence are documented in
[permissions](https://code.claude.com/docs/en/permissions); only flag acceptance was tested with the fake home.

`--dangerously-skip-permissions` and `--permission-mode bypassPermissions` bypass permission checks. Use them only
at the user's explicit request, never as the default autonomous launch.

## Permission prompts

Only in `manual` mode (and for commands in `accept edits`). In `auto` mode the agent decides on its own and asks only
for risky actions. Read-only commands such as `echo` run without asking.

File creation or edit:

```text
Do you want to create <file>?
❯ 1. Yes
  2. Yes, and switch to accept edits (auto-approve file edits and common file commands) for this session (shift+tab)
  3. No
Esc to cancel · Tab to amend
```

Command:

```text
Bash command
Do you want to proceed?
❯ 1. Yes
  2. Yes, and always allow access to <folder> from this project
  3. Yes, and switch to auto mode · auto mode handles these prompts for you
  4. No
Esc to cancel · Tab to amend
```

- Option 1 is preselected: Enter (`\n`) approves once. **A number key picks its option at once**, with no Enter.
- Every option other than "Yes" and "No" changes the mode for the session or persists a rule for the project: ask the
  user first.
- "No" interrupts the turn and the agent waits for new instructions.

## Permission mode

Shift+Tab (`\e[Z`) cycles: `auto` → `manual` → `accept edits` → `plan` → `auto`. The change lasts for the session. The
default for new sessions is **Default permission mode** in `/config`.

## Model and effort

- `/model`, Enter → **Select model**. ↑/↓ picks, ←/→ sets effort.
- **Enter saves the model as the default for every new session.** Press `s` to use it in this session only. Esc cancels
  (`⎿ Kept model as <model>`).
- **Exact ids:** `claude --help` documents `--model` with an alias for the latest model (`opus`, `sonnet`, `fable`) or a
  full name such as `claude-opus-5-5`, `claude-sonnet-5-5` or `claude-haiku-5-5`, and `--effort` with `low`, `medium`,
  `high`, `xhigh` or `max`. Presets in `maestri preset list` show working commands. `/effort` sets effort alone.

## Settings (`/config`)

- One panel with tabs: **Settings**, **Status**, **Config**, **Usage**, **Stats**. ↑ from the top of the list reaches
  the tabs; ←/→ switches tab. Typing filters settings. Esc clears the search, then closes.
- Enter or ↓ moves from the search box into the list; Enter on a setting changes it. Navigate with ↑/↓ only.
- Settings that matter to the Maestro: **Default permission mode**, **Model**, **Continue automatically at usage
  limit**, **Prompt suggestions** (the greyed suggestions in the input), **Auto-compact**, **Thinking mode**, **Fast
  mode**.
- **Status** tab: version, session id, login method and account, model, MCP servers, setting sources, and system
  diagnostics (e.g. a PATH warning).
- Persistent settings live in `~/.claude/settings.json`, `.claude/settings.json` and `.claude/settings.local.json`;
  prefer them, or launch flags, over the TUI.

## Quota

- `/config` → **Usage** tab (↑ from the list reaches the tabs, → three times from Settings): limits with a bar, the
  **percent used** and the reset time, e.g. `Current week (all models) … 80% used · Resets Nov 6, 2am`. Windows:
  current session (five hours), current week (all models), current week per model family. Below them, hints on what
  drives usage (long contexts, always-on context). Usage credits are off unless turned on with `/usage-credits`.
- `/context`: how much of the context window is in use. Not yet verified live on this version: read the screen.
- **Continue automatically at usage limit** in `/config` lets the agent keep going when a limit is hit.
- Recovery: wait for the reset, or move the agent to another account with
  `maestri recruit --replace "Name" --account "Other"`.
- Not yet observed: the limit-reached screen.

## Keys

| Key | Raw | Action |
|---|---|---|
| Enter | `\n` | Send or confirm (send it apart from the text) |
| Esc | `\e` | Close a panel; cancel a prompt; interrupts the agent while it works. **Twice** clears the input |
| Backspace | `\x7f` | Delete a character |
| ↑ / ↓ | `\e[A` / `\e[B` | Navigate |
| 1-9 | `1`... | Pick a numbered option immediately |
| Shift+Tab | `\e[Z` | **Cycles the permission mode**: do not send unless asked |
| Alt+P | | **Switches model** |
| Ctrl+C | `\x03` | Interrupts or clears; **twice, exits** |
| Ctrl+D | `\x04` | **Exits**: never send |
| `?` | `?` | Shortcuts panel (in an empty input) |
| `!` | `!` | Shell mode (in an empty input) |

## Slash commands for the Maestro

`/model`, `/effort`, `/config` (settings, status, usage), `/permissions`, `/context`, `/compact [what to keep]`,
`/clear`, `/resume`, `/rewind`, `/btw` (side question), `/mcp`, `/hooks`, `/help`. `/exit`, `/logout` and `/login` stop
the agent or change its login: only when the user asks.

## Built-in capabilities

Tools (from the docs, present in a Claude Code 2.1.302 session): `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Bash`,
`PowerShell`, `NotebookEdit`, `WebSearch`, `WebFetch`, `Agent`, `SendMessage`, `Workflow`, `Monitor`, `CronCreate`,
`EnterPlanMode`, `EnterWorktree`, `AskUserQuestion`, `Skill`, `Artifact` (claude.ai login on a paid plan). Some load on
demand through `ToolSearch`.

| Need | How |
|---|---|
| Web search, read a URL | `WebSearch`, `WebFetch` |
| Read images, PDF | `Read`; paste an image with Alt+V on Windows |
| Drive a browser | Only with the Claude in Chrome extension enabled |
| Subagents | `Agent` (types `Explore`, `Plan`, `general-purpose`) |
| Many agents from a script | `Workflow`; `/deep-research <question>` (paid plans) |
| Code review | `/code-review`, `/security-review` |
| Plan before editing | Plan mode (Shift+Tab) or `/plan` |
| Side question while it works | `/btw` (no tools, out of history) |
| Repeat or schedule | `/loop`, `/schedule` |
| Git worktree | `claude --worktree <name>`, `EnterWorktree` |
| Shareable page | `Artifact` |

Bundled skills (`disableBundledSkills` turns them off): `/code-review`, `/simplify`, `/security-review`, `/loop`,
`/schedule`, `/run`, `/verify`, `/batch`, `/claude-api`, `/dataviz`, `/update-config`, `/fewer-permission-prompts`,
`/debug`, `/doctor`, `/init`, the artifact guides, and `/workflow-authoring` when workflows are on.

Skills with a `plugin:` prefix, from the claude.ai account (`anthropic-skills:`), or in `~/.claude/skills` (where
Maestri installs its own) are not built in.

## Not yet observed

Limit-reached screen, logged-out screen, API or network errors.
