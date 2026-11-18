# Team Roster

Permanent team record. Owner: Regente. Project facts go in the `Project Context` fichário, never here.

## Agents

Current assignment (updated 2026-11-18). Regente keeps it in step with the terminals: after a model change, update
the row and this date. The map's review date below changes only when its benchmarks are reviewed.

| Name | Role | CLI | Model · effort | Control |
|---|---|---|---|---|
| Regente | Team Maestro | Claude Code | Opus 5.5 · high | pinned: CLI and model |
| Bússola | UX/UI Designer | Claude Code | Opus 5.5 · high | Regente |
| Vitral | Frontend Engineer | Claude Code | Sonnet 5.5 · high | Regente |
| Sentinela | AppSec Auditor | Claude Code | Opus 5.5 · medium, no Edit/Write | Regente |
| Crivo | Code Reviewer | Claude Code | Sonnet 5.5 · high, no Edit/Write | Regente |
| Alicerce | Backend Architect | Antigravity | gemini-4-carbon-high | Regente |
| Forja | Backend Engineer | Antigravity | gemini-4-carbon-high | Regente |
| Guindaste | DevOps Engineer | Antigravity | gemini-4-carbon-high | Regente |
| Sonda | Research Analyst | Antigravity | gemini-4-carbon-high | Regente |
| Ensaio | QA Engineer | Antigravity | gemini-4-hydrogen-xhigh | Regente |
| Retina | Visual QA Inspector | Antigravity | gemini-4-hydrogen-high | Regente |
| Formiga | Task Runner | Antigravity | gemini-3.8-flash-medium, limited | Regente |
| Aquarela | Visual Asset Designer | Codex | gpt-6.2-sol · low + imagegen | Regente |

## Model map (reviewed 2026-11-18)

Environment it assumes: Claude Max 5x, ChatGPT Plus, Google AI Ultra. Basis: independent coding, agent and
bug-fixing benchmarks (snapshot and method in the `maestri-budget` skill, `references/model-evaluation.md`). Take the
first choice the environment survey finds available; move right when it is not, or when its pool is off pace.

| Agent | Tier | First | Second | Third |
|---|---|---|---|---|
| Regente | Deep | Claude Opus 5.5 high (pinned) | - | - |
| Bússola | Visual, validated | Claude Opus 5.5 high (validated for design) | Claude Sonnet 5.5 high | Gemini 4 Hydrogen xhigh |
| Vitral | Standard, visual | Claude Sonnet 5.5 high | Gemini 4 Hydrogen xhigh | GPT-6.2 Sol high |
| Alicerce | Deep | Gemini 4 Carbon high | Claude Opus 5.5 high | GPT-6.2 Astra high |
| Forja | Standard (builder) | Gemini 4 Carbon high | Claude Sonnet 5.5 high | GPT-6.2 Sol medium |
| Guindaste | Deep (deploy, CI, secrets) | Gemini 4 Carbon high | Claude Opus 5.5 medium | GPT-6.2 Astra high |
| Sonda | Deep | Gemini 4 Carbon high | Claude Opus 5.5 high | - |
| Ensaio | Standard | Gemini 4 Hydrogen xhigh | Claude Sonnet 5.5 medium | GPT-6.2 Sol medium |
| Retina | Standard, visual | Gemini 4 Hydrogen high | Claude Sonnet 5.5 medium | - |
| Crivo | Standard reviewer | Claude Sonnet 5.5 high | Claude Opus 5.5 medium | Gemini 4 Carbon high |
| Sentinela | Deep, security | Claude Opus 5.5 medium | Gemini 4 Carbon high | GPT-6.2 Astra high |
| Formiga | Fast, limited | Gemini 3.8 Flash medium | Gemini 4 Hydrogen low | - |
| Aquarela | Images | Codex gpt-6.2-sol low + imagegen | `Gemini` portal | - |

- The tier is the agent's floor: a High-risk task still gets the reviews and the deep-tier validation the
  `risk-process` and `model-tiers` rules require.
- Builders run on the largest quota (Ultra) and the reviewers on Claude, so most changes are reviewed by another
  provider. Vitral's changes share Claude with Crivo; when you move either side, keep author and reviewer apart where
  the map allows.
- Formiga stays on Antigravity with its allowlist (`--settings`, `--mode accept-edits`): it has no verified limited
  setup on Claude Code or Codex. If Antigravity is unavailable, its chores go to Regente's judgment, not to an
  unlimited fast model.
- Never Gemini 4 Argon for code (FrontierCode 27.6); never the fast tier for money, authentication or security.
- Read-only on Antigravity is not enforced by flags: if Crivo or Sentinela move there, their role holds it.
- Orchestrator (Carbon plans, Hydrogen executes) is untested here: trial it on one Forja task against Carbon before
  adopting it (maestri-budget, untested modes).
- Review the map only when the survey shows a new or removed model, a plan change, or this date is three months old.

Launch modes: Claude `--permission-mode auto`; Codex `--approve-for-me` (workspace-write sandbox, no shell network by
default); Antigravity `--mode auto`, except Formiga: limited agent (`--mode accept-edits` plus a session `--settings`
allowlist with `toolPermission: request-review`). Allowed: read, search, `mkdir`, `mv`, read-only git, `git mv`,
`maestri ask/list/note read`; denied: `rm`, network, permission changes, git writes. Other commands prompt: approve once
only when in scope, never options 2 or 3. Every agent starts in the role folder and gets the project root with
`--add-dir ../../..`. Exact commands are stored on each terminal and in the partitura.

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

Production deploys, releases, merges, destructive operations, handling secrets, sensitive configuration, CI secrets and
repository settings, significant scope or architecture changes, a pinned model, an account the survey did not list or a
second account of the same CLI, a plan change, paid credits or quota resets, and changes to presets or partituras. Model
changes within the map need no approval: Regente applies them between tasks and tells the human in one line.

## Contingencies (Regente applies between tasks, records in Decisions)

| Trigger | Action |
|---|---|
| A pool above pace (over 1.0) for two checkpoints | Move one agent at a time, the busiest first, to its next column in the model map, only when that column is in a pool below pace; otherwise keep the agent and defer or report the work |
| The same task fails twice | Replan with a Deep agent (Alicerce, or Regente); do not change the builder's model mid-task |
| Codex quota exhausted | Images through the `Gemini` portal (Aquarela) until it resets |
| Images | ChatGPT Images (Aquarela, imagegen) first; Nano Banana through the `Gemini` portal for alternatives and edits; capture is rendered pixels, no transparency |
| Agent unavailable | Reassign only to a competent role; tell the human |

Every change: `maestri recruit --replace "<agent>" --command "<command>"` after the agent's report (the terminal keeps
it across restarts), check its footer, update the tables above and give the human the new command for the kit's
`team.json` and the saved partitura. Regente never saves a partitura from a project.

## New project checklist

1. Insert the partitura in the project's workspace.
2. Fill `Project Context` → Requirements (instance block first).
3. Make sure the repository has `AGENTS.md` (kit template) with commands and the risk map.
4. Regente surveys the environment, checks the model map against it, runs a ping round and reads every pool once
   (maestri-budget checkpoint).
