# OpenAI Codex CLI

Verified live on Codex 0.164.0, Windows, ChatGPT Free account (2026-10-27); quota windows and `/clear` on 0.166.0, paid
plan (2026-11-04).

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
- `/status` may show a mode not in that list (here `Workspace (granular)`). Read Only shows as
  `Read Only (Ask for approval)`.
- **Changing the mode gives no confirmation screen**, only a history line `• Permission selection requested: <mode>`,
  and options 3 (Full Access) and 4 (Read Only) sit next to each other. Run `/status` after every change and check
  `Permissions:`.
- On Windows the sandbox is set in `~/.codex/config.toml`, e.g. `[windows] sandbox = "elevated"`.
- Blocked by the sandbox, the agent can **refuse on its own without an approval prompt**: asked to write outside the
  workspace, it replied that the folder is not writable and stopped. Read its reply, not only the screen state.
- Changing the permission mode lowers or raises what the agent may do on the user's behalf: ask the user first.
- `/approve` approves one retry of a recent auto-review denial.

## Recruited with a role

Verified on Codex 0.167.0, Linux (2026-11-06).

- A recruit with a role starts in `<workspace>/.maestri/roles/<id>/`, and workspace-write covers only that folder. Add
  `--add-dir ../../..` to the command: `/status` then shows `Workspace [<workspace root>]`. A folder every Codex agent
  may write goes in `~/.codex/config.toml` as `[sandbox_workspace_write]` `writable_roots = ["<path>"]`.
- `AGENTS.md` from the role folder and from the repository both load (`/status` → `Agents.md`).
- Startup can stop on **Hooks need review** (`1 hook is new or changed`). With the ECC plugin, its `SessionStart` hook
  asked again at every start: Codex re-syncs the plugin cache on launch and the stored content hash no longer matches.
  Esc skips it (that hook does not run; trusted hooks keep running); `t` in the review panel trusts it until the next
  start. Trusting is a persistent choice: ask the user once, then repeat it at each start.

## Autonomous launch and command rules

Verified on Codex 0.166.0, Windows (2026-11-06): local help, isolated rule checks and a live recruited agent.

```bash
codex --no-daemon --approve-for-me
```

`--approve-for-me` routes approval requests through automatic review with the workspace-write sandbox. It does not
grant full access. Verify `/status`: **Workspace (Approve for me)**. The live check ran `npm.cmd --version` and wrote
a workspace file without human approval. PowerShell blocked `npm.ps1`; `npm.cmd` worked. Hook trust remains separate:
the test session continued without trusting hooks, so this check did not exercise hook execution.

Alternative: `codex --no-daemon -a never -s workspace-write` never asks a person; failures return to the agent.
It does not provide automatic approval for blocked operations. For tasks requiring shell networking, the configuration
override is `-c sandbox_workspace_write.network_access=true`; this enables outbound network within workspace-write,
not writes outside it. The key is documented and accepted by the installed parser; outbound access was not tested.
The unauthenticated fake-home run reported read-only permissions: always verify effective permissions after startup.
See the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

For a limited agent, use a dedicated `CODEX_HOME` and a sandbox, with narrow grants in
`CODEX_HOME/rules/default.rules` (normally `~/.codex/rules/default.rules`):

```python
prefix_rule(pattern = ['npm', '--version'], decision = 'allow')
prefix_rule(pattern = ['git', 'push'], decision = 'forbidden')
```

```bash
codex --no-daemon -a never -s read-only
codex execpolicy check --rules /path/to/isolated-codex/rules/default.rules -- npm --version
```

Set `CODEX_HOME` to the prepared directory before either command. The installed checker returned `allow` for
`npm --version`, `forbidden` for `git push`, and no match for `npm install`. Write rule files as UTF-8 without BOM;
the installed parser rejected a BOM. Rules match argument prefixes; choose task-specific command grants.

Approval option `p` saves the proposed prefix as an allow rule in the user layer's `rules/default.rules`; it is not a
one-time approval. The save location is documented; this review did not press `p` against a real home. Rules load at
startup, including trusted project layers.
See [command rules](https://learn.chatgpt.com/docs/agent-configuration/rules).

These grants control execution outside the sandbox; unmatched commands can still run within sandbox permissions.
Neither `-a never` nor an allow rule list creates a strict commands-only boundary. Use an external enforcement layer
if that is required. Do not combine limited-agent grants with `--approve-for-me`, which can approve other requests.
`--dangerously-bypass-approvals-and-sandbox` removes both safeguards: use only at the user's explicit request.

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

- `/model` → **Select Model and Effort**: numbered models, `enter select · esc back`. The list depends on the plan (on a
  Free account: GPT-6-Luna, GPT-5.6-Terra, GPT-5.6-Luna).
- **Exact ids:** `codex debug models` prints the account's catalog as JSON: `slug` is the id (e.g. `gpt-6.1-sol`) and
  `supported_reasoning_levels` lists the efforts. Launch with
  `codex --model <slug> -c model_reasoning_effort=<low|medium|high|...>`.

## Quota

- `/status` shows the limit as **percent left**, e.g. `Monthly limit: [bar] 100% left (resets 15:45 on 26 Nov)` on a
  Free account, and points to <https://chatgpt.com/settings/usage>. On a paid plan (Codex 0.166) it shows a five-hour
  and a weekly limit, each with percent left and reset time.
- Context: the docs say `/status` also shows token usage; not yet verified live.
- `/usage` → **Usage**: `View analytics` (usage history) and `Redeem reset` (use a usage-limit reset when one is
  available).
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

`/status`, `/model`, `/permissions`, `/approve`, `/usage`, `/config`, `/compact`, `/clear` (clears the terminal and
starts a new chat), `/new`, `/resume`, `/plan`, `/side` (side conversation in a fork), `/diff`, `/warnings`, `/mcp`,
`/hooks`, `/skills`, `/daemon`. Destructive or stopping: `/delete` (permanently deletes the session), `/archive`,
`/logout`, `/quit` and `/exit`: only when the user asks.

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

The workspace-write sandbox keeps shell networking off by default. Configure needed access at recruitment using the
launch guidance above; a later change to a running agent follows the skill's permission-prompt policy.

Built-in skills (`~/.codex/skills/.system`): `imagegen`, `openai-docs`, `review-agent`, `skill-creator`,
`skill-installer`. Without any install by the user, `$` (or `/skills` → List skills) also showed OpenAI curated plugins
in `~/.codex/plugins/cache/openai-curated-remote`: `plugin-management` and `work-pets` (pet skills), plus apps such as
Codex Document Control and Safety Settings. Maestri's skills in the list come from Maestri, not from Codex.

## Notes

- With `--no-daemon` the startup warning is:
  `Running without the shared background server: Bedrock sign-in requires embedded mode.`

- Startup warning `Codex could not find bubblewrap on PATH` on Linux: Codex falls back to its bundled bubblewrap.
  Installing the OS package removes the warning.

## Not yet observed

Limit-reached screen, logged-out screen, API or network errors.
