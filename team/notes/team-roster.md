# Team Roster

Permanent team record. Owner: Regente. Project facts go in the `Project Context` fichário, never here.

## Agents

| Name | Role | CLI | Model · effort | Plan the command assumes |
|---|---|---|---|---|
| Regente | Team Maestro | Claude Code | Opus 5.5 · high | Claude Max |
| Vitral | Frontend Engineer | Claude Code | Sonnet 5.5 · high | Claude Max |
| Bússola | UX/UI Designer | Claude Code | Opus 5.5 · high | Claude Max |
| Alicerce | Backend Architect | Claude Code | Sonnet 5.5 · high | Claude Max |
| Sentinela | AppSec Auditor | Claude Code | Opus 5.5 · medium, no Edit/Write | Claude Max |
| Crivo | Code Reviewer | Claude Code | Opus 5.5 · medium, no Edit/Write | Claude Max |
| Guindaste | DevOps Engineer | Claude Code | Sonnet 5.5 · medium | Claude Max |
| Forja | Backend Engineer | Codex | gpt-6.1-sol · medium | ChatGPT Plus |
| Ensaio | QA Engineer | Codex | gpt-6.1-sol · medium | ChatGPT Plus |
| Aquarela | Visual Asset Designer | Codex | gpt-6.1-sol · low + imagegen | ChatGPT Plus |
| Retina | Visual QA Inspector | Antigravity | gemini-4-argon-medium | Gemini Pro / Argon |
| Sonda | Research Analyst | Antigravity | gemini-4-argon-high | Gemini Pro / Argon |
| Formiga | Task Runner | Antigravity | gemini-3.8-flash-medium | Gemini Pro / Gemini |

Launch modes: Claude `--permission-mode auto`; Codex `--approve-for-me` (workspace-write sandbox, no shell network by
default); Antigravity `--mode auto`, except Formiga: limited agent (`--mode accept-edits` plus a session `--settings`
allowlist with `toolPermission: request-review`). Allowed: read, search, `mkdir`, `mv`, read-only git, `git mv`,
`maestri ask/list/note read`; denied: `rm`, network, permission changes, git writes. Other commands prompt: approve once
only when in scope, never options 2 or 3. Codex and Antigravity start in the role folder and get the project root with
`--add-dir ../../..`. Exact commands are stored on each terminal (and in the partitura).

Codex restarts may stop on `Hooks need review` (the ECC `SessionStart` hook loses its trust at every start): the
human trusts it, so press `t` in the review panel, or Esc to skip it; the kit's own hooks keep running either way.

Tier colors (Maestri roles have no color field): Coordination gold · Specification purple · Implementation blue/teal ·
Validation red/orange · Support green/pink/gray.

## Topology

Regente <-> everyone. Peers: Vitral-Bússola, Vitral-Alicerce, Vitral-Ensaio, Vitral-Crivo, Vitral-Retina,
Bússola-Retina, Bússola-Aquarela, Alicerce-Forja, Alicerce-Guindaste, Alicerce-Sentinela, Forja-Ensaio, Forja-Crivo,
Forja-Sentinela (added: backend security findings reach the fixer), Guindaste-Sentinela, Guindaste-Crivo.
Sonda and Formiga: Regente only. Findings for an owner without a rope go through Regente with their ref.

## Human approval required

Production deploys, releases, merges, destructive operations, handling secrets, sensitive configuration, CI secrets
and repository settings, significant scope or architecture changes, any change of an agent's model, effort or
platform (contingencies included).

## Contingencies (propose to the human, apply after OK, between tasks, record in Decisions)

| Trigger | Action |
|---|---|
| ChatGPT Plus exhausted | Ensaio to Claude Sonnet 5.5 medium: `maestri recruit --replace "Ensaio" --command "claude --model claude-sonnet-5-5 --effort medium --permission-mode auto --add-dir ../../.."`; verify the auto mode footer; keep it independent of the implementer |
| Claude Max usage high | Vitral `/effort medium` for routine tasks (session only); Guindaste already runs medium |
| ChatGPT Plus idle | Simple, non-sensitive DevOps scripts may go to Forja, reviewed by Crivo; sensitive work stays with Guindaste |
| Argon low | Retina only at milestones; Sonda only for questions that block a decision |
| Images | ChatGPT Images (Aquarela, imagegen) first; Nano Banana through the `Gemini` portal (Aquarela) for alternatives and edits; capture is rendered pixels, no transparency |
| Agent unavailable | Reassign only to a competent role; tell the human if it changes an approved configuration |

Review the distribution two weeks after the team's first real task, and record the date in Decisions.

## New project checklist

1. Insert the partitura in the project's workspace.
2. Fill `Project Context` → Requirements (instance block first).
3. Make sure the repository has `AGENTS.md` (kit template) with commands and the risk map.
4. Regente runs a ping round and reads every pool once (maestri-budget checkpoint).
