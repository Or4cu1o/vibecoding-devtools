# Antigravity CLI

Verified live on Antigravity CLI 1.4.8, Windows, Google AI Pro account (2026-10-27).

## Identify

- Launch command: `agy`, e.g. `agy --model gemini-4-argon-high --effort high`.
- Banner: `Antigravity CLI <version>`, account and plan, model and effort, workspace folder.
- Footer: `<model> · <effort>`, e.g. `Gemini 3.8 Flash · medium`.
- `?` → tab **general**: version, account, workspace, project config (`~/.gemini/config/projects/default-cli-project.json`), log (`~/.gemini/antigravity-cli/log/`), conversation id.

## States

| State | On screen |
|---|---|
| Idle | Empty `>` input; footer `? for shortcuts` |
| Notice | Block with `┃` lines and `esc to dismiss` above the input |
| Menu or panel | Footer `Keyboard: ...` or `esc to cancel` |
| Permission prompt | `Allow creation of this file?` or `Run this command?` with numbered options |
| Done | Agent's reply, then an empty `>` input |

`● Edited 1 file (...)` and `● Ran (...)` show up while the permission prompt is still open: they do not mean the action happened.

## Sending a prompt

Text and `\n` in a single `--raw` call submitted the prompt. Sending the Enter in a separate call, as the skill recommends, is the safe default across CLIs.

## Permission prompts

File edit or creation:

```
Allow creation of this file?
> 1. Yes, allow creation
  2. No, deny creation
  ↑/↓ Navigate · tab Amend · f full diff
esc to cancel
```

Command:

```
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

1. `/model`, Enter → **Switch Model** picker.
2. ↑/↓ picks the model, ←/→ sets effort (low, medium, high), Enter confirms, Esc goes back.
3. Confirmation in the history: `⎿ Model set to <model> (<Effort>)`.

Switching model resets effort to medium. `/effort` sets effort alone. Both can be set at launch: `agy --model <id> --effort <level>`.

A `/model` change does not survive a restart when the preset command pins the model: after Maestri relaunched it with `--model gemini-4-argon-high --effort high`, the agent was back on Argon high.

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

Also: Animation Speed, Color Scheme, Conversation Picker Grouping, Copy on Select, Editor, Editor Mode, Enable Telemetry, Notifications, Rendering Mode, Seasonal Themes, Show Active Tasks, Show Feedback Survey, Show Tips.

## Quota

- `/usage` (alias `quota`): quota per model group, each with a weekly and a five-hour limit and the time until it refreshes. Esc closes it.
  - **Gemini** group: Gemini Flash, Gemini Pro.
  - **Claude and GPT** group: Claude Opus, Claude Sonnet, GPT-OSS.
- Groups are separate: when one runs out, `/model` to a model of the other group can keep the agent working on the same account.
- `/credits`: remaining G1 credits. With **Use AI Credits** on, the agent keeps going on credits after the quota ends; turning it on spends money, so ask the user.
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

`/model`, `/effort`, `/config`, `/permissions`, `/usage`, `/credits`, `/clear`, `/compact`, `/context`, `/resume`, `/rewind`, `/tasks`, `/btw` (side question without interrupting the task), `/skills`, `/mcp`, `/hooks`, `/help`. `/exit` and `/logout` stop the agent or sign it out: only when the user asks.

## Built-in capabilities

Tools as the agent listed them (Gemini 3.8 Flash): `read_file` (text, images, audio, video, PDF), `edit_file`, `write_file`, `run_command`, `manage_task`, `ask_question`, `invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`, `schedule`, `search_web`.

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

Built-in skills (`~/.gemini/antigravity-cli/builtin/skills`, marked `built-in` in `/skills`): `agy-customizations`, `antigravity-guide`, `schedule automation`, `migrate-workflows`, `run-workflow` (Python script that orchestrates many agents). The folder also holds `generative_ui`, `permissioned-github`, `plugin` and `ui-plugin-navigation`, which `/skills` did not list as built-in in the CLI.

`/skills` also lists skills from `~/.gemini/config/skills` (where Maestri installs its own) and from plugins: those are not built in.

## Not yet observed

Quota-exhausted screen, logged-out screen, model or network errors, and how Queued Messages behaves while the agent is busy.
