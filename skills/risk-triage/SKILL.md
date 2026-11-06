---
name: risk-triage
description: Classifies a task or diff as Low, Medium or High risk and returns the minimum contract, testing and review plan. Use at the start of every coding task, before delegating, and when a finding suggests the risk has changed.
---

# Risk triage

Goal: spend as little time and as few tokens as the risk allows, without leaving gaps involving money, data or access.
Follow the `risk-process` rule and the `testing` rule.

## Steps

1. List the files the change will touch. If the diff already exists: `git diff --name-only <base>...HEAD`.
2. Read the project's risk map in `AGENTS.md`, if present. It overrides the generic list below.
3. Mark each file's level:
   - **High:** money and value (payments, balances, sales), personal data, authentication, sessions, permissions,
     administrative commands, secrets, external input the system publishes or executes, data migration or deletion,
     deploy, CI, dependencies.
   - **Medium:** business logic, bug fixes, behavior changes.
   - **Low:** assets, text, styling, docs, versions, logs; configuration values unrelated to authentication,
     permissions, CORS, limits, secrets or money.
4. The task level is the highest among its files.
5. Independent areas (front, back, infra) in a change that is not small: split according to **Parallel by area** in
   the `risk-process` rule. At High risk, call the `security-surfaces` skill with only the touched surfaces.
6. Reply in this format, in at most 8 lines:

```text
Level: <Low|Medium|High>: <one-sentence reason naming the deciding file>
Areas: <front/back/infra and who handles each>
Contract: <none | the request itself | one page>
Tests: <none | 1 regression | risk paths: ...>
Reviews: <CI or local verification | + diff reading | + architecture, testing and security>
Done when: <criterion>
```

## Examples

- Replace a provider icon: **Low**. No tests or reviewers.
- Fix a command that hangs when skipping tracks: **Medium**. One regression test and diff reading.
- Large fix touching the dashboard endpoint and screen component: **Medium**; back and front are independent,
  so run in parallel. If the fix is only a few lines, one builder handles both.
- New card checkout: **High**, with full baseline.
- Publish external text to a channel (song name, username): **High**. Security review is limited to that point:
  escaping mentions and links.
