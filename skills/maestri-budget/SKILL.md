---
name: maestri-budget
description: Pace the context and quota of the agents on the Maestri canvas, so every CLI's quota lasts the whole cycle and none is left unused when it resets. Load it as the Maestro at a checkpoint - start of a session, after a large delegated task finishes, before handing out a large task, or when an agent shows a limit warning - never for routine checks.
---

# Context and Quota Budget

You're the Maestro on a Maestri canvas. The agents may run different CLIs on different accounts, and each account has
its own quota pools, windows and prices. Pace them: a pool that runs out early stops the work, and quota left when a
pool resets is lost. The goal is every pool close to empty at its reset, with no stop before it.

You pace by **choosing who gets each task** and **which model each agent runs** (section 4). Reading quota and
context costs tokens too, so you read them only at checkpoints and decide from your ledger in between. How to open
each screen is in the `maestri-agent-cli` references.

## 0. Environment

Know what you work with before you assign a model. Survey at the start of a session, and again when a CLI's version,
an account's plan or a model list changes. Between surveys, decide from the ledger.

1. **CLIs:** which agent CLIs are installed, and their versions (`claude --version`, `codex --version`,
   `agy --version`). A missing command means that CLI is not available.
2. **Plans:** the account and plan behind each CLI, read with the command in its `maestri-agent-cli` reference. The
   plan sets which models you can use and roughly how much quota you get. No vendor publishes quota sizes: compare
   plans by the pace you measure (section 3), never by price.
3. **Models:** the models each account offers, from the list command in each reference (Claude Code has none: its
   `--model` aliases name the latest models). Only a new version or family counts as a change; older and hidden
   models in the list do not.
4. **Quotas:** every pool, as in section 2.
5. **Paid overage:** whether paid credits are already on (Antigravity `/credits`, Claude Code `/usage-credits`). If
   they are, tell the user once: a pool that runs out then keeps going on money.

Write the result to an `## Environment` section of the ledger:

```markdown
## Environment

| CLI | Version | Account / plan | Models offered | Read at |
|---|---|---|---|---|
| Antigravity | 1.5.10 | Google AI Ultra | Carbon, Argon, Hydrogen, Orchestrator, Flash 3.8 | Mon 10:12 |
```

**The model map.** The team's map (the `Team Roster` note, or the project's configuration) lists, per agent, the model
to use on each CLI with its alternatives, the benchmarks behind it and the date it was reviewed. Use it as it is.
Review it, with the method in [model-evaluation.md](references/model-evaluation.md), only when the survey shows a model
the map does not list, a listed model is gone, a plan changed, or the review is more than about three months old.
Never research benchmarks just to start a session.

## 1. Checkpoints

Read at these moments only, never on a timer and never while the agent you would read is working:

- **Start of a session**, or your first delegation: every pool and every agent.
- **A large task finished**: the agent reported DONE or PENDING on a task that took many turns or more than about half
  an hour. Read that agent's pool and context.
- **Before handing out a large task**: choose the agent from the ledger. Read again only if that pool's row is more than
  a few hours old.
- **A limit warning**, an error about quota, or an agent that slows down: read that pool.

## 2. Ledger

Add a `## Pools` section to the `ledger.md` that `maestri-agent-cli` keeps in your session directory:

```markdown
## Pools

| Pool | Agents | Window | Left | Resets at | Read at |
|---|---|---|---|---|---|
| Antigravity / Gemini | Lynx | week | 82% | Sat 14:00 | Mon 10:12 |
| Antigravity / Gemini | Lynx | 5 h | 60% | Mon 13:40 | Mon 10:12 |
| Claude Code / Default | Hawk | week | 55% | Thu 09:00 | Mon 10:12 |
```

- One row per pool and window, scarce pools included (a model with its own small quota). **Pool** names the CLI, the
  account and the group: two accounts of the same CLI are two pools.
- **Left** is the percent remaining. Claude Code shows percent used: write `100 - used`.
- Write **Resets at** and **Read at** as date and time: `Refreshes in 98h 45m` read at Mon 10:12 resets Fri 13:00.
- **Your own pool:** you spend quota too, and you cannot open your own CLI's panels through `maestri`. If an agent runs
  on your account, its reading covers you; otherwise ask the user for your numbers at a full checkpoint.

## 3. Pace and delegation

For each pool, at a checkpoint:

- `elapsed` = 100 × time already gone / window length, from the reset time (a percent, like `used`).
- `used` = 100 - left.
- `pace` = used / elapsed. Above 1.0, the pool runs out before it resets.
- Unknown window length or reset time, or a reading taken before the pool's last reset: do not compute; read the pool
  again at the next checkpoint.

| Pace | Meaning | Do |
|---|---|---|
| below 0.85 | quota will be left over | send more work to the agents on this pool |
| 0.85 to 1.0 | on track | keep going |
| above 1.0 | runs out before reset | send new work to agents on other pools |
| above 1.3 | runs out well before reset | only essential work here; tell the user if routing cannot fix it |

- While less than 15% of a window has gone, skip the pace and keep the previous decision; a pool already spent or too
  low for the next task still counts.
- A pool with two windows (five hours and week) is limited by the tighter one: decide by the worse of the two.

- **Roles come first.** Who does what is set by the agents' role prompts and by your own instructions. An agent with a
  dedicated function does that function: never take a task from its owner to save quota.
- **Everyone works.** The main agents carry the main work; an agent declared as a helper on a lighter model takes the
  simple, repetitive tasks to relieve them. It supports them and never replaces them: overload it and its pool runs out
  early. An idle agent with quota left is quota lost.
- **Pace splits the rest.** Work that more than one agent could do goes to the one whose pool is furthest below pace,
  matching the task to the agent's model: mechanical work (docs, renames, formatting, triage) to lighter models, deep
  reasoning (architecture, hard debugging, costly-to-get-wrong planning) to the strongest. Smaller quotas end up with
  less work, larger ones with more. Short, focused tasks last longest: quota is spent in proportion to token cost.
- **Verify work from lighter models, always.** A result from an agent on a lighter model (such as Gemini Flash on
  Antigravity) is a claim until you check it, even when it reports DONE. Check it in proportion to the task, without
  redoing it: read the file it wrote, rerun the count or command, read the diff and run the tests, or send code to a
  main agent for review. Report it to the user only after that. Keep development work off lighter models when you can.
- **Scarce pools** (a small weekly-only quota for one model): enough for only a few large tasks a week.
  Reserve them for the tasks that truly need that model and plan those tasks for the week.
- **Short windows** (five hours): when one is nearly spent, send work to agents on other pools until it refreshes. Do
  not change the weekly plan because of it.
- **Last day of a cycle:** a pool that will reset with quota left takes work pulled forward from the backlog the user
  already approved. Never invent work just to spend quota.

## 4. Choosing and switching models

You choose each agent's CLI, model and effort; the user pins the exceptions. For every agent:

- **Start from the map.** Take the map's model for the agent on the CLIs and plans the survey found; when it is not
  available, take the map's next alternative. Stay within the `model-tiers` rule: money, authentication and security
  never run on the fast tier.
- **Pinned stays pinned.** A model or CLI the user pinned (for example, the Maestro on Claude Code) changes only at the
  user's request. Mark it `pinned: <what>` in the ledger.
- **Accounts:** moving an agent to another CLI on an account the survey listed is part of the map. A second account
  of the same CLI, an account the survey did not list, or a plan change needs the user (section 6).
- **Balance by pace.** When a pool stays above 1.0 for two checkpoints, move one agent at a time, starting with the
  one doing the most work, to its next choice in the map, on an account the survey listed, and only when that choice
  is in a pool below pace (another model in the same pool changes nothing). With no such choice, keep the agent and
  defer the work or tell the user. Below pace is not a reason to move anyone: send that pool more work instead.
- **Author and reviewer on different providers** when the map allows it: a second provider catches what the first
  misses.
- **Untested modes**, a model or mode with no independent benchmark yet (such as Antigravity's Orchestrator): try it
  on one real task against the map's model, comparing the result and the quota spent (pool before and after), and
  adopt it only if it does as well for less.
- **Switch only between tasks**, never mid-task: a switch mid-task loses the prompt cache and costs more.
- **Make it permanent.** A `/model` change is lost at the next restart. Relaunch the agent with the new command, which
  keeps its node and connections: `maestri recruit --replace "Name" --command "<new command>"`. The terminal keeps
  that command across restarts. Its chat context is lost, so do it after its report. Then update the agent's row and
  date in the map. Never save a partitura from a project to record it: a partitura is the user's template, and saving
  it from a working canvas copies that project's notes into it. Tell the user the new command instead.

## 5. Context: every agent

- **Before handing any task to an agent**, if it is unrelated to what that agent did last and the previous task is
  closed, clear it first with the command in its CLI reference (`/clear` in the three, as of the versions there). This
  needs no reading and keeps the new task from paying for the old context.
- **At a checkpoint**, read the context of the agents that just finished. If the next task continues the same work and
  context is above about 60%, `/compact`; where the reference says it takes text (Claude Code), add what must survive,
  e.g. `/compact keep the T-12 decisions, open items and files touched`.
- **Never** compact or clear an agent that is working, is in the middle of a task, has a prompt or menu open, or whose
  report has not arrived. Compacting between tasks keeps the CLI's own auto-compaction from firing in the middle of one.
- **You, the Maestro,** follow the same limit. Estimate your own context at every checkpoint and between the steps of a
  long task, since one task can use up the rest of the window; near about 60%, finish the current atomic step, write
  open tasks, refs, pending reports and owner decisions to `ledger.md` and the project notes, then stop. Compact
  yourself if your CLI lets you (in Claude Code the model cannot run `/compact`), otherwise tell the user in one line
  and stay idle until they compact you. Keep tool output small all along: filter long results (`tail`, `--jq`, line
  ranges) and leave file dumps and long reads to a subagent or a specialist.

## 6. Ask the user first

Turning on paid credits (Antigravity **Use AI Credits**, extra usage), using a usage-limit reset (Codex **Redeem
reset**), moving an agent to an account the survey did not list or to a second account of the same CLI, changing a
plan, changing a model the user pinned, or changing a preset.
After a full checkpoint, tell the user only what is off pace or needs their decision, one line per pool.
