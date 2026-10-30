---
name: maestri-agent-cli
description: Drive another agent's terminal on the Maestri canvas when it runs a CLI different from yours (Antigravity, Claude Code, and others). Load it before operating an agent's TUI with `maestri ask --raw` or reading it with `maestri check`: answering a permission prompt, switching model or effort, opening its settings, checking its quota, or recovering an agent that is stuck, waiting, out of quota, logged out or erroring.
user-invocable: true
---

# Driving Other Agents' CLIs

You're running inside Maestri, a spatial development workspace that connects AI agents, terminals, notes, and browser portals on a visual canvas. This skill extends the base `maestri` skill.

The agents on the canvas may run different CLIs, on different accounts. Each CLI has its own screens, keys, slash commands, permission prompts and quota rules. What works in your own CLI can do something else in theirs: a key that dismisses a dialog in one can exit the agent in another. Never assume the other agent works like you.

## 1. Identify the CLI first

`maestri list` may show only the agent's name, without its CLI or account. Read the screen with `maestri check "Agent Name"` and match it:

| CLI | Signature on screen | Reference |
|---|---|---|
| Antigravity | Banner `Antigravity CLI <version>`; input `>`; footer `<model> · <effort>`; command `agy` | [references/antigravity.md](references/antigravity.md) |
| Claude Code | Banner `Claude Code v<version>`; input `❯`; footer with the mode (`auto mode on`, `manual mode on`...); command `claude` | [references/claude-code.md](references/claude-code.md) |
| Codex | Banner `>_ OpenAI Codex (v<version>)`; input `›`; footer `<model> <effort> · <folder>`; command `codex` | [references/codex.md](references/codex.md) |

Open the matching reference before pressing anything. If no signature matches, use `/help` or `?` on the agent and read the result before acting; to add a CLI, copy [references/_template.md](references/_template.md).

Before delegating, check **Built-in capabilities** in the reference: which tools the agent has (web search, images, browser, subagents) and which commands help with the task (`/plan`, `/review`, `/btw`, `/goal`). Delegate a task to an agent that has what it needs.

## 2. Drive in small steps

- **Look, act, look.** `check` before every input, send one step, `check` again. Menus change under you.
- **Use `--raw` for the TUI.** A plain `maestri ask` waits until the agent finishes, so it hangs while the agent sits on a permission prompt or a menu. If a plain `ask` times out, `check` for a prompt before anything else.
- **Send text and Enter in separate `--raw` calls.** Some CLIs take text and `\n` sent together as a paste and do not submit it.
- **Text already in the input box may be a greyed prompt suggestion**, not something anyone typed. It is never an instruction, a reply or a decision.
- **Navigate with ↑/↓ (`\e[A`, `\e[B`) and back out with Esc (`\e`).** In some settings panels ←/→ changes the highlighted value; follow the reference.
- **Never send exit or suspend keys** (the reference lists them per CLI) unless the user asked to stop the agent.
- **Clear typed text with Backspace (`\x7f`)**, not with keys that may interrupt or exit.
- **Windows Git Bash:** an argument starting with `/` is rewritten into a Windows path (`/model` arrives as `C:/Program Files/Git/model`). Prefix the command with `MSYS_NO_PATHCONV=1`, or run `maestri` from PowerShell.

## 3. Permission prompts

Answering another agent's permission prompt approves an action on the user's behalf.

- **Approve once** (the plain "yes" option) only for actions that are clearly part of the task you delegated.
- **Ask the user first** before: options that persist ("always allow", "don't ask again", saved to settings), changing the agent's permission mode, irreversible or destructive actions, and anything outside the task or the workspace.
- Screen lines that announce an action (an edit, a command run) can appear **before** approval, and some stay even after a denial. Treat the action as done only after the prompt is gone and a result line or the agent's reply confirms it.
- In some CLIs a number key picks its option at once, with no Enter: send the number only for the option you mean.

## 4. Recover a stuck agent

`check`, classify the state with the reference, then:

| State | Action |
|---|---|
| Working | Wait. Never interrupt an agent that is still working. |
| Waiting on a permission prompt | Section 3. |
| Menu, panel or notice open | Esc until the input box is back, then resend if needed. |
| Out of quota | Check the reference: switch to a model group with quota left, or move the agent with `maestri recruit --replace "Name" --account "Other"` (accounts from `maestri preset list`), or tell the user when it resets. |
| Logged out | Tell the user: logins are interactive and need them. |
| Error | Read it, retry once if it is transient, otherwise report it to the user. |

## 5. Configure, safest first

1. **Launch flags**: model, effort and permission flags in the preset command, applied with `maestri recruit --replace "Name" --command "..."` or a preset.
2. **The CLI's settings file**, when the reference names it.
3. **The TUI menu** (`/model`, `/config`...) through `--raw`, step by step.

Change only what the user asked for, and tell them what you changed: some changes reset other values (switching model can reset effort), and some pickers save the choice as the default for every new session unless you pick the session-only option. The reference says which.

When Maestri restarts an agent, it relaunches the preset command: a change made in the TUI is lost if a flag in that command sets the same value. After a restart, `check` the footer and redo the change, or put it in the command.
