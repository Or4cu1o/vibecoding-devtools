# Testing

Tests protect behavior, not freeze structure. This rule replaces generic coverage targets and mandatory TDD
(for example, ECC's 80% and TDD). Repository testing rules override this one.

## What deserves tests

- Security: authentication, sessions, permissions, secrets and all user input.
- Money and personal data.
- Data persistence and migration.
- Configuration loading (precedence and types).
- Contracts with external services (APIs, gateways, queues).
- Pure rules: functions without side effects that make a decision.
- Real bug regressions: one test per bug.

## Prohibited

- Mass characterization (tests capturing all current behavior).
- Structural snapshots or golden tests.
- Tests reading the text of docs, compose, Dockerfiles or workflows.
- Tests depending on the real clock or `sleep`.
- Tautological tests that only restate a constant or mock.
- Multiple tests for the same path changing only the value: use lean parametrization.
- Mutation testing outside High risk.

## TDD

RED first only for bug fixes and pure rules. Otherwise, test afterward, and only if the item falls under
"What deserves tests".

## Coverage

- Global repository floor that never drops.
- Higher floor (for example, 90%) only in the project's listed critical areas (money, authentication, data, pure rules),
  enforced by a CI step: a PR that reduces coverage in those areas fails.
- High risk involving money, personal data or authentication: coverage follows the `risk-process` rule.
- No global target just to raise the number.

## Markers

`smoke` (system starts), `critical` (critical areas) and `regression` (one per real bug). CI runs `smoke` and `critical`
first and fails early.

## Where to run

- CI runs lint, typecheck and the full suite. Locally, run only tests for what you changed.
- Multiple agents do not run the same suite on the same commit: CI is the source of truth.
- Done follows the `risk-process` rule: green CI or, without CI, equivalent local verification.

## Warning sign

On a Low- or Medium-risk item, test lines several times greater than production lines indicate excess. Stop and
reassess what actually needs testing.
