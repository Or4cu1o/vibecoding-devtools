# OpenAI Codex CLI

Verified live on Codex 0.164.0, Windows, ChatGPT Free account (2026-10-27).

## Identify

- Launch command: `codex`, e.g. `codex --no-daemon`.
- Banner: `>_ OpenAI Codex (v<version>)` and the working folder.
- Input prompt is `›`.
- Footer: `<model> <effort> · <folder>`, then `? for shortcuts` and warnings such as `⚠ 1 warning · f2 to view`.
- `/status`: model and reasoning effort, provider, folder, **Permissions**, `AGENTS.md` in use, **Account** and plan,
  collaboration mode, session id, and the usage limit with its reset date.

## States

| State | On screen |
|---|---|
| Idle | `› Ask Codex to do anything` (placeholder) |
| Done | `• <reply>` then `Worked for <time> • <clock>` and an idle input |
| Warnings panel | `Warnings · 1 of 1 · ...` with `k keep & next · esc dismiss & close` |
| Menu | Numbered list with `enter select · esc back` |
| Approval prompt | `Would you like to run the following command?` with numbered options |

The warnings panel can open on its own while you type: then your keys go to the panel (`k` keeps the warning and closes
it). `check` before sending text, and resend if it did not reach the input.

## Sending a prompt

Send the text, then `\n` in a separate `--raw` call.

## Permissions and sandbox

- `/permissions` → **Update Model Permissions**:
  1. **Ask for approval**: reads and edits the workspace and runs commands; asks for internet access or edits outside
     the workspace.
  2. **Approve for me**: asks only for actions detected as potentially unsafe.
  3. **Full Access**: edits outside the workspace and uses the internet without asking.
  4. **Read Only**: reads the workspace; asks for edits and internet access.
- `/status` may show a mode not in that list (here `Workspace (granular)`). Read Only shows as `Read Only (Ask for approval)`.
- **Changing the mode gives no confirmation screen**, only a history line `• Permission selection requested: <mode>`,
  and options 3 (Full Access) and 4 (Read Only) sit next to each other. Run `/status` after every change and check
  `Permissions:`.
- On Windows the sandbox is set in `~/.codex/config.toml`, e.g. `[windows] sandbox = "elevated"`.
- Blocked by the sandbox, the agent can **refuse on its own without an approval prompt**: asked to write outside the
  workspace, it replied that the folder is not writable and stopped. Read its reply, not only the screen state.
- Changing the permission mode lowers or raises what the agent may do on the user's behalf: ask the user first.
- `/approve` approves one retry of a recent auto-review denial.

## Approval prompt

```text
• Running <command>
  Would you like to run the following command?
  Environment: local
  Reason: <why the agent needs it>
  $ <command>
› 1. Yes, proceed (y)
  2. Yes, and don't ask again for commands that start with `<command>` (p)
  3. No, and tell Codex what to do differently (esc)
  Press enter to confirm or esc to cancel
```

- Edits also come as commands (e.g. `Set-Content` on Windows), so file edits show this same prompt.
- `• Running <command>` shows up **before** approval. After it, the history shows
  `✔ You approved codex to run <command> this time`, then `• Ran <command>` and its output.
- Enter or `y` approves once. `p` (option 2) persists the rule: ask the user first. Esc denies.

## Model and effort

- `/model` → **Select Model and Effort**: numbered models (GPT-6-Luna, GPT-5.6-Terra, GPT-5.6-Luna on a Free account),
  `enter select · esc back`.
- At launch: `codex --model <id>`.

## Quota

- `/status` shows the limit, e.g. `Monthly limit: [bar] 100% left (resets 15:45 on 26 Nov)`, and points to <https://chatgpt.com/settings/usage>.
- `/usage` → **Usage**: `View analytics` (usage history) and `Redeem reset` (use a usage-limit reset when one is available).
- Not yet observed: the limit-reached screen.

## Keys

| Key | Raw | Action |
|---|---|---|
| Enter | `\n` | Send or select |
| Esc | `\e` | Back; closes menus and the warnings panel (dismissing the warning) |
| Backspace | `\x7f` | Delete a character |
| ↑ / ↓ | `\e[A` / `\e[B` | Navigate |
| F2 | `\eOQ` | Open the warnings panel |
| `k` | `k` | In the warnings panel: keep the warning and go to the next |
| `y` / `p` | `y` / `p` | In an approval prompt: approve once / approve and persist the rule |
| `?` | | **Typed as text**: it does not open a shortcuts panel |

## Slash commands for the Maestro

`/status`, `/model`, `/permissions`, `/approve`, `/usage`, `/config`, `/compact`, `/new`, `/resume`, `/plan`, `/side`
(side conversation in a fork), `/diff`, `/warnings`, `/mcp`, `/hooks`, `/skills`, `/daemon`. Destructive or stopping:
`/delete` (permanently deletes the session), `/archive`, `/logout`, `/quit` and `/exit`: only when the user asks.

## Built-in capabilities

Tools as the agent listed them (GPT-6-Luna): `functions.exec` runs JavaScript that calls the work tools
(`tools.exec_command`, `tools.write_stdin`, `tools.apply_patch`, `tools.view_image`, `tools.web__run`, goal and MCP
tools); `collaboration.spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents` for
subagents; `request_user_input`, `clock.sleep`.

| Need | How |
|---|---|
| Web search | `tools.web__run`; the docs also name the launch flag `codex --search` |
| Read images | `tools.view_image`; `codex --image <file>` at launch |
| Generate images | Skill `imagegen` |
| Subagents | `collaboration.spawn_agent`; `/agents`, `/subagents` |
| Code review | `/review` (working tree, base branch, commit), skill `review-agent` |
| Plan before editing | `/plan` (not while it works) |
| Side question | `/side` or `/btw` |
| Run until a goal is met | `/goal` |
| Background terminals | `/ps`; `/stop` stops them all |
| Git worktree | `/worktree` |

The sandbox keeps the network off by default for commands: a task that downloads or calls an API from the shell may need
a permission change (ask the user).

Built-in skills (`~/.codex/skills/.system`): `imagegen`, `openai-docs`, `review-agent`, `skill-creator`,
`skill-installer`. Without any install by the user, `$` (or `/skills` → List skills) also showed OpenAI curated plugins
in `~/.codex/plugins/cache/openai-curated-remote`: `plugin-management` and `work-pets` (pet skills), plus apps such as
Codex Document Control and Safety Settings. Maestri's skills in the list come from Maestri, not from Codex.

## Notes

- With `--no-daemon` the startup warning is:
  `Running without the shared background server: Bedrock sign-in requires embedded mode.`

## Not yet observed

Limit-reached screen, logged-out screen, API or network errors.
