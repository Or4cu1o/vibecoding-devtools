# Model evaluation

How to place models in the `model-tiers` tiers for a team that codes, orchestrates agents and hunts bugs. Use it only
when the environment survey shows a change the map does not cover, or when the map's review date is about three
months old (section 0 of the skill); otherwise the team's model map and the snapshot below already answer.

## Method

1. **Sources, independent only:** the model pages of [BenchLM](https://benchlm.ai/) (`/models/<slug>`, one per model)
   and [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models). Leaderboard home pages show only
   composite indexes; the per-benchmark scores are on the model pages. Vendor pages and launch posts are claims.
2. **Keep only third-party rows.** BenchLM labels who ran each result: drop rows the model's own vendor reported, and
   results the vendor ran on its own harness.
3. **Only the benchmarks that match this work:**

   | Work | Benchmarks |
   |---|---|
   | Code a maintainer would merge | FrontierCode 2.0, CursorBench 4.0, FrontierSWE v2 |
   | Agent work in a terminal, orchestration | Terminal-Bench 4.x, AA AutomationBench |
   | Find and fix bugs in a codebase | Bug Hunt Bench, SWE-bench Pro, SWE-sweep (when third-party) |

   Ignore math, knowledge, chat, writing and multimodal scores.
4. **Weigh cost.** Subscription quota is spent in proportion to token cost, so between close scores the cheaper model
   lasts longer. Artificial Analysis shows cost per task.
5. **Place each model** in a tier per CLI: Deep for the best two or three, Standard for the next group, Fast for the
   cheap models that only suit mechanical work. A model weak at code goes nowhere near a builder, whatever its tier
   elsewhere.
6. **Record** the date, the sources and the scores you used in the team's model map, and update this snapshot if you
   maintain the kit.

## Snapshot (2026-11-18)

Third-party rows from the BenchLM model pages, which carry the Artificial Analysis (AA) runs.

| Model | TB 4.1 | AA TB 4.0 | FrontierCode 2.0 | CursorBench 4.0 | FrontierSWE v2 | Bug Hunt | AA AutomationBench | AA $/task |
|---|---|---|---|---|---|---|---|---|
| Gemini 4 Carbon (high) | 64.6 | 65.2 | 42.6 | 60.4 | 61.2 | 57.3 | 77.8 | 5.48 |
| Claude Opus 5.5 | 65.8 | 59.6 | 47.3 | 57.8 | 62.3 | 41.7 | 69.5 | 10.04 |
| Claude Sonnet 5.5 | 63.9 | 63.6 | 42.2 | 55.5 | 61.9 | 51.3 | 71.8 | 10.02 |
| GPT-6.2 Astra | - | 64.1 | - | - | - | - | 77.2 | 4.00 |
| GPT-6.2 Sol | - | 60.1 | - | - | - | - | 71.3 | 1.01 |
| Gemini 4 Hydrogen (xhigh) | 56.4 | 53.5 | 38.9 | 54.3 | 53.1 | 32.7 | - | 3.16 |
| Gemini 4 Argon | 55.5 | - | 27.6 | 52.9 | 55.0 | 40.7 | 77.5 | 4.97 |
| GPT-6.1 Terra | 53.3 | 55.6 | - | - | - | - | 60.2 | 0.96 |
| Claude Haiku 5.5 | 40.0 | 32.8 | 28.9 | 48.4 | 43.8 | 21.5 | 35.4 | 0.41 |
| Gemini 3.8 Flash | 18.2 | - | - | - | 19.6 | 18.0 | - | - |
| GPT-6 Luna | 15.2 | 12.6 | 22.7 | - | - | 18.3 | 53.2 | 0.15 |

Tiers this snapshot gives, per CLI:

| Tier | Claude Code | Antigravity | Codex |
|---|---|---|---|
| Deep | Opus 5.5 | Gemini 4 Carbon high | GPT-6.2 Astra |
| Standard | Sonnet 5.5 | Gemini 4 Hydrogen xhigh or high | GPT-6.2 Sol |
| Fast | Haiku 5.5 | Gemini 3.8 Flash | GPT-6 Luna |

- Carbon and Opus 5.5 are level on code: Carbon leads at finding bugs and at agent work, Opus at code a maintainer
  would merge. Carbon costs about half per task.
- Sonnet 5.5 is close to Opus and finds more bugs: a good reviewer.
- Gemini 4 Argon is weak at code (FrontierCode 27.6): agent orchestration only, never a builder.
- Gemini 3.8 Flash and GPT-6 Luna: mechanical work only, always verified.
- Antigravity's Orchestrator (Carbon or Argon plans, Hydrogen executes) has no independent result: trial it first.
