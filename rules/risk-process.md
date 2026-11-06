# Risk-based process

Effort, time and token cost follow the risk of the change. Replacing an image takes minutes; a payment system receives
full review.

## How to classify

- Whoever requests the work (the orchestrator, or the agent itself when working alone) states the level at the start.
- The riskiest file in the change determines the level of the whole change.
- Whoever finds greater risk along the way reports it, and the level rises. It does not fall mid-task without agreement.
- Triage by a lightweight model only keeps or raises the level, never lowers it.
- Each project may have its own risk map in `AGENTS.md` (what is High there). The project map overrides this rule.

## Levels

### Low

Images and assets, text, emojis, styling, documentation, versions, log text, dead code removal outside High-risk
surfaces, and configuration values unrelated to authentication, permissions, CORS, limits, secrets or money.

- No contract, no new tests (unless repository testing rules require them) and no reviewers.
- Done = green CI + no blocking findings (see **Findings**) + clean secrets scan.

### Medium

Bug fixes and changes to existing behavior that do not touch a High-risk surface.

- The request is the contract: goal, files and completion criteria, in a few lines.
- Tests follow the `testing` rule.
- One review: the orchestrator reads the diff. Architecture only if the change crosses modules; security only if it
  touches a High-risk surface.
- Done = Low + this review.

### High

Money and value (payments, balances, sales, financial integrations); personal or sensitive data; authentication,
sessions, permissions and administrative actions; secrets and tokens; external input the system executes or publishes
for others (injection, mass mentions, malicious links); data migration or deletion; deploy, CI and supply chain.

- Contract of at most one page: behavior, interfaces, owner decisions and a test plan focused on risk.
- Threat model limited to the sensitive surface, before coding.
- Tests on risk paths.
- Architecture, testing and security each review once, in parallel, on the final commit.
- Money, personal data or authentication: e2e for every touched flow and coverage ≥ 80% on changed code. Such a flow
  built from scratch: also the full baseline (OWASP ASVS 5.0 L2).

## At every level

- **Parallel by area:** when an item involves independent areas (front, back, infra), each goes to its builder at the
  same time, with one owner per file. They agree on the shared interface directly, and the orchestrator checks once
  that the parts fit together. Small changes stay with one builder.
- **One pass per review**, on the final commit. Review again only if production code in that reviewer's area changed;
  test-only or docs-only commits do not call anyone back.
- **Automated review** (CodeRabbit, GitGuardian and similar): wait for completion and fix everything in one submission.
- **No CI, automated review or reviewers:** run the equivalent locally (lint, typecheck, tests for changed code,
  secrets scan), perform reviews sequentially and state in the report what could not be verified.
- **Findings:** every review (human, agent or automated) classifies each finding as **Critical**, **Major**, **Minor**
  or **Suggestion** (automated review nitpick). Low, Medium and High are task risk levels only, never finding
  severities. This is the single source of blocking rules; skills and other rules refer here.
  - **Exposed secret:** always blocks, even if predating the PR. Rotate the secret before proceeding.
  - **Critical** and **Major** introduced by the PR: always block.
  - **Minor:** blocks High-risk tasks. At other levels, fix if trivial; otherwise, explain why and send to the backlog.
  - **Suggestion:** fix if trivial; otherwise, backlog.
  - **Predating the PR:** Minor and Suggestion go to the backlog without a new cycle. Critical and Major block until
    the owner decides to fix in the PR or accept the risk, recorded in a private channel, never a public issue.
- **Loop:** the same fix failing twice returns to the orchestrator, without a third attempt.
- **Communication:** message only those who need to act; short reports with evidence. To the owner, only decisions,
  merges, releases and blockers.
- **CHANGELOG:** the builder writes the entry in their own PR.
