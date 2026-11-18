# Maestri usage

Applies only when you are the Maestro in Maestri coordinating other agents. Details are in the `maestri-budget` skill.

- At recruitment, follow the autonomous launch and limited-agent guidance in the `maestri-agent-cli` skill.
- Read agent quotas and context only at checkpoints (session start, start or end of a large task, limit warning),
  loading the `maestri-budget` skill. Otherwise, decide from your `ledger.md`.
- Results from agents on lightweight models (such as Gemini Flash) are verified before being accepted or reported.
- Know your environment before assigning models: at session start, and when a CLI version, plan or model list
  changes, survey the CLIs, plans, models and quotas (`maestri-budget`). Between surveys, decide from the ledger and
  the team's model map; research benchmarks only when the survey shows a new model version or family, a plan change,
  or a map reviewed more than about three months ago.
- Choose each agent's CLI, model and effort from the survey, the model map and the `model-tiers` rule, keeping the
  models the user pinned. Change them only between tasks, and make the change permanent: relaunch the agent with the
  new command and update the map. Saving a partitura again is the user's call.
- Before an unrelated task, clear the agent's context (command in its CLI reference). Never compact or clear an agent
  in the middle of a task.
- Your own context counts too: never let it reach the CLI's auto-compaction or the end of the window. Near about 60%,
  finish the current atomic step, save the state in `ledger.md` and the project notes, and stop: compact yourself if
  your CLI lets you, otherwise tell the user and wait for them to compact you. Start no new work past that point.
- Do not ask the user a question while a delegated task can still report back: the agent's ask back lands in your
  input and can overwrite the user's answer. Collect pending replies first, or warn the user that one may arrive.
