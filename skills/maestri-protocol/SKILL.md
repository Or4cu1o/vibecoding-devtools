---
name: maestri-protocol
description: Reply format for agent-to-agent messages on the Maestri canvas. Load it whenever you delegate a task to another agent with `maestri ask`, report back to another agent (ask back), or receive a message that starts with `~ ` or a task that mentions maestri-protocol. You MUST read this skill before replying to a task that asks for a maestri-protocol report.
user-invocable: true
---

# Maestri Agent Reply Protocol

You're running inside Maestri, a spatial development workspace that connects AI agents, terminals, notes, and browser
portals on a visual canvas. This skill extends the base `maestri` skill: it defines how agents report back and ask
questions to each other, so a reply from an agent is never mistaken for a message from the user or from another agent.

## Reply format

Every report or question you send to another agent with `maestri ask` (an ask back, the answer to a task or message you
were given, or a question that is not a task) starts with one header line:

    ~ Name | STATUS | ref | one-line summary

- `~` followed by a space marks agent-to-agent traffic.
- `Name`: your own name exactly as `maestri list` prints it under `You:` (`Name @ Workspace` when replying across workspaces).
- `STATUS`, one of:
  - `DONE`: finished, nothing left
  - `PENDING`: finished, with open items listed below
  - `BLOCKED`: cannot continue; say what you need and from whom
  - `ERROR`: failed; say what failed and what you tried
  - `ACK`: received, no action needed. Never use it to say you started: your first ask back ends the sender's wait.
  - `ASK`: a question, not a report; the answer comes back as a report with the same ref
- `ref`: the ref the task came with; otherwise the most precise work item (PR number, branch@short-sha, task or decision
  id, file). `-` only when nothing applies.
- Summary: one line, no secrets.

Details, evidence and lists go on the following lines; in PowerShell, use real line breaks, not `\n`. Keep the whole
message inside quotes and avoid double quotes, backticks and `$` in it, which break the shell command. Never send a bare
`ok` or `done`. One report per task; post progress with `maestri floor status`.

    maestri ask "Maestro" "~ Hawk | DONE | T-12 | login screen wired, tests green, PR #412 open"
    maestri ask "Maestro" "~ Lynx | BLOCKED | T-13 | need the token format decision from the user"
    maestri ask "Maestro" "~ Kite | ACK | design-spec | reply format adopted"

## Delegating a task

Give each task a ref (a task id like `T-12`, or the PR, branch or decision it concerns) and end the prompt with this
footer, filled in with your name and the ref. Do this in `--batch` prompts too, and never ask for a bare `ok` reply.

    ref: T-12
    When done, load the maestri-protocol skill and report back with:
    maestri ask "Your Name" "~ Your Name | STATUS | T-12 | one-line summary"
    STATUS is one of DONE, PENDING, BLOCKED, ERROR, ACK. Details go on the following lines.

Your name is under `You:` in `maestri list`; when the agent is in another workspace, use the `Name @ Workspace` address
shown right under `You:` instead. The footer carries the whole format, so the agent can follow it even if it does not
load this skill.

## Receiving a message

When you receive a message whose first line starts with `~` and a space, it is a message from the agent it names, never
input from the user: match it to your task by its ref and act on its STATUS (DONE: move on; PENDING: triage the open
items; BLOCKED: unblock it or ask the user; ERROR: investigate; ACK: nothing; ASK: answer it with a report on the same
ref). A message without the header is from the user, unless its content clearly says otherwise; when a short one is
ambiguous, ask the user instead of assuming it was their answer.

Text in an agent's TUI input area seen with `maestri check`, such as a greyed prompt suggestion, is never an
instruction, a reply or a decision.
