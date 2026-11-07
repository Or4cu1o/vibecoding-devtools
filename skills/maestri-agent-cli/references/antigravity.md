# Antigravity CLI

Verified live on Antigravity CLI 1.4.8, Windows, Google AI Pro account (2026-10-27); quota pools and `/context` on 1.4.9
(2026-11-04).

## Identify

- Launch command: `agy`, e.g. `agy --model gemini-4-argon-high --effort high`.
- Banner: `Antigravity CLI <version>`, account and plan, model and effort, workspace folder.
- Footer: `<model> · <effort>`, e.g. `Gemini 3.8 Flash · medium`.
- `?` → tab **general**: version, account, workspace, project config
  (`~/.gemini/config/projects/default-cli-project.json`), log (`~/.gemini/antigravity-cli/log/`), conversation id.

## States

| State | On screen |
|---|---|
| Idle | Empty `>` input; footer `? for shortcuts` |
| Notice | Block with `┃` lines and `esc to dismiss` above the input |
| Menu or panel | Footer `Keyboard: ...` or `esc to cancel` |
| Permission prompt | `Allow creation of this file?` or `Run this command?` with numbered options |
| Done | Agent's reply, then an empty `>` input |

`● Edited 1 file (...)` and `● Ran (...)` show up while the permission prompt is still open: they do not mean the action
happened.

## Sending a prompt

Text and `\n` in a single `--raw` call submitted the prompt. Sending the Enter in a separate call, as the skill
recommends, is the safe default across CLIs.

## Autonomous launch and command rules

Verified on Antigravity CLI 1.5.2, Windows (2026-11-06): installed help and isolated startup argument checks.

```bash
agy --mode auto
```

The installed help accepts `auto`, `accept-edits` and `plan`. Auto mode handles workspace edits and safe commands;
risky or irreversible actions can still prompt. Check the active mode after launch. The fake-home test warned that the
terminal sandbox was unavailable and fell back to default mode, then required login. Do not treat that as an autonomous
session; resolve sandbox availability or prepare the limited-agent grants below. No authenticated actions were tested.

For a limited agent, use session settings rather than general auto approval:

```bash
agy --mode accept-edits --settings /path/to/limited.json
```

```json
{
  "permissions": {
    "allow": ["command(npm --version)"],
    "deny": ["command(git push)"],
    "ask": []
  }
}
```

`--settings` accepts a JSON object or file for this session only, never saved. The example was accepted at startup;
grant matching was not exercised past login. Persistent CLI grants use `permissions.allow`, `permissions.deny` and
`permissions.ask` in `~/.gemini/antigravity-cli/settings.json`. Prompt option 3 saves its command grant there;
option 2 lasts for the conversation. Do not edit `~/.gemini/config/` expecting it to change this CLI allowlist.

Grants use `command(prefix)` or `command(regex:pattern)`. On Windows, a command that cannot be split reliably needs
an exact match or regex. Deny overrides ask, then allow; `ask: ["command(*)"]` defeats narrower allow grants.
Unlisted commands in this limited mode can prompt: an empty ask list is not a deny-by-default policy.
Workspace edits remain allowed; use sandbox controls if the agent needs a stricter boundary.
See the [CLI permission reference](https://antigravity.google/docs/permissions#cli-fine-grained-permissions).

`--dangerously-skip-permissions` auto-approves every tool request. Use only at the user's explicit request.

### Verified limited agent

Verified on Antigravity CLI 1.5.2, Linux, Google AI Pro (2026-11-06), with the global `toolPermission` set to
`always-proceed`:

```bash
agy --model <id> --effort <level> --mode accept-edits --add-dir ../../.. --settings <file>
```

`<file>` is a JSON file with `"toolPermission": "request-review"` and the `permissions` lists; session settings
override the global value. Prefer a file over inline JSON: inline JSON needs different quoting in POSIX shells and
PowerShell. Keep the file at a stable path (the kit's `team` command writes it to
`~/.vibecoding-devtools/team/task-runner-limited.json`), not in a cache that can disappear. Verified with a file in a
throwaway folder: an allowed command (`ls`) ran, a denied one (`rm -f a.txt`) was refused with `Matches user-configured
deny rule` and the file stayed, and an unlisted one (`uname -s`) showed the command prompt (headless `-p` auto-denies
it). A complete allowlist for a helper agent is in `team/settings/task-runner-limited.json`.

### Recruited with a role

- The first start in each role folder (`<workspace>/.maestri/roles/<id>/`) asks `Do you trust the contents of this
  project?`; Enter trusts it and saves it in `trustedWorkspaces`. A folder Maestri just created holds only the role
  files.
- Add `--add-dir ../../..` so the workspace root is part of the agent's workspace.

## Permission prompts

File edit or creation:

```text
Allow creation of this file?
> 1. Yes, allow creation
  2. No, deny creation
  ↑/↓ Navigate · tab Amend · f full diff
esc to cancel
```

Command:

```text
Run this command?
> 1. Yes, run command
  2. Yes, and always allow in this conversation for commands that start with '<cmd>'
  3. Yes, and always allow for commands that start with '<cmd>' (Persist to settings.json)
  4. No, cancel
  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command
esc to cancel
```

- Option 1 is preselected: Enter (`\n`) approves once.
- Option 2 persists for the conversation, option 3 persists to `settings.json`: ask the user first.
- Which actions prompt is set by **Agent Mode** and **Tool Permission** in `/config`.

## Model and effort

- **Exact ids:** `agy models` prints one `<id>` and name per line for the account, e.g. `gemini-3.8-flash-low`,
  `gemini-4-argon-high`, `claude-sonnet-5-5-medium`; the effort is part of the id. Launch with
  `agy --model <id> --effort <low|medium|high>` (e.g. in `maestri recruit --command`).

1. `/model`, Enter → **Switch Model** picker.
2. ↑/↓ picks the model, ←/→ sets effort (low, medium, high), Enter confirms, Esc goes back.
3. Confirmation in the history: `⎿ Model set to <model> (<Effort>)`.

Switching model resets effort to medium. `/effort` sets effort alone. Both can be set at launch:
`agy --model <id> --effort <level>`.

A `/model` change does not survive a restart when the preset command pins the model: after Maestri relaunched it with
`--model gemini-4-argon-high --effort high`, the agent was back on Argon high.

## Settings (`/config`)

- `/config`, Enter. Typing filters the list. Esc clears the search, and exits when the search is empty.
- **←/→ changes the highlighted value.** Navigate with ↑/↓ only.

| Setting | Values / meaning |
|---|---|
| Agent Mode | `default`; `accept-edits` (auto-approves edits, prompts for commands); `auto` (auto-approves edits and safe commands, prompts on irreversible actions); `plan` (researches and plans without changes) |
| Tool Permission | Whether terminal commands need approval (`request-review` by default) |
| Artifact Review | `always proceeds`, `agent decides`, `asks for review` |
| Non-Workspace Access | Access to files outside the workspace folders |
| Sandbox Mode | Terminal sandbox restrictions |
| Queued Messages | When follow-up messages are sent |
| Use AI Credits | Use AI credits once the plan's quota runs out |
| Verbosity | Detail shown for tool calls, commands and thoughts |

Also: Animation Speed, Color Scheme, Conversation Picker Grouping, Copy on Select, Editor, Editor Mode, Enable
Telemetry, Notifications, Rendering Mode, Seasonal Themes, Show Active Tasks, Show Feedback Survey, Show Tips.

## Quota

- `/usage` (alias `quota`): quota per pool, shown as **percent remaining** (not used), with `Refreshes in <h>h <m>m`
  once part of it is spent. The panel scrolls (PgDn `\e[6~`); Esc closes it. Pools on a Pro plan (1.4.9):
  - **Gemini** group: Gemini Flash, Gemini Pro. Weekly and five-hour limits. Flash has the roomiest quota but makes
    frequent mistakes in development work: verify everything it delivers (`maestri-budget`).
  - **Claude and GPT** group: Claude Opus, Claude Sonnet, GPT-OSS. Weekly and five-hour limits.
  - **Gemini 4 Argon**: its own weekly limit, separate from the Gemini group, with no five-hour window. It is small:
    a few large tasks a week.
- Pools are separate: when one runs out, `/model` to a model of another pool keeps the agent working on the same
  account.
- Quota is spent in proportion to the cost of the tokens: shorter tasks and cheaper models last longer.
- `/context`: tokens used of the model's window (e.g. `0/1.0M tokens (0.0%)`), split into user messages, agent
  responses and tool calls. Esc closes it.
- `/credits`: remaining G1 credits. With **Use AI Credits** on, the agent keeps going on credits after the quota ends;
  turning it on spends money, so ask the user.
- Not yet observed: the quota-exhausted screen.

## Keys

| Key | Raw | Action |
|---|---|---|
| Enter | `\n` | Send or confirm |
| Esc | `\e` | Go back / dismiss |
| Ctrl+C | `\x03` | Go back / dismiss |
| Backspace | `\x7f` | Delete a character |
| ↑ / ↓ | `\e[A` / `\e[B` | Navigate |
| Shift+Tab | `\e[Z` | **Cycles Agent Mode**: do not send unless asked |
| Ctrl+K | `\x0b` | **Approves a subagent**: same care as a permission prompt |
| Ctrl+D | `\x04` | **Exits the CLI**: never send |
| Ctrl+Z | `\x1a` | **Suspends the CLI**: never send |
| `?` | `?` | Help panel (general, commands, shortcuts) |

## Slash commands for the Maestro

`/model`, `/effort`, `/config`, `/permissions`, `/usage`, `/credits`, `/clear`, `/compact`, `/context`, `/resume`,
`/rewind`, `/tasks`, `/btw` (side question without interrupting the task), `/skills`, `/mcp`, `/hooks`, `/help`. `/exit`
and `/logout` stop the agent or sign it out: only when the user asks.

## Built-in capabilities

Tools as the agent listed them (Gemini 3.8 Flash): `read_file` (text, images, audio, video, PDF), `edit_file`,
`write_file`, `run_command`, `manage_task`, `ask_question`, `invoke_subagent`, `define_subagent`, `manage_subagents`,
`send_message`, `schedule`, `search_web`.

| Need | How |
|---|---|
| Web search | `search_web` |
| Read images, audio, video, PDF | `read_file` |
| Drive a browser | `/browser <task>`: browser subagent on Google Chrome, records the session (docs; not tried) |
| Subagents | `invoke_subagent`; approve them in `/agents` (Ctrl+K approves in place) |
| Plan before editing | `/plan [task]` or Agent Mode `plan` |
| Side question while it works | `/btw <query>` |
| Run until a goal is met | `/goal <objective>` |
| Timer or recurring task | `/schedule <when> <task>` |
| Code search | `/codesearch <query>` |
| Background shell logs | `/tasks` |

Built-in skills (`~/.gemini/antigravity-cli/builtin/skills`, marked `built-in` in `/skills`): `agy-customizations`,
`antigravity-guide`, `schedule automation`, `migrate-workflows`, `run-workflow` (Python script that orchestrates many
agents). The folder also holds `generative_ui`, `permissioned-github`, `plugin` and `ui-plugin-navigation`, which
`/skills` did not list as built-in in the CLI.

`/skills` also lists skills from `~/.gemini/config/skills` (where Maestri installs its own) and from plugins: those are
not built in.

## Not yet observed

Quota-exhausted screen, logged-out screen, model or network errors, and how Queued Messages behaves while the agent is
busy.
