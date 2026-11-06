<!--
AGENTS.md template from vibecoding-devtools. Copy to the project root, fill in <...> and delete what does not apply,
including this comment. Claude Code, Codex and Antigravity read this file; the project's CLAUDE.md contains only
`@AGENTS.md`.

Limits: Codex reads at most 32 KiB across all AGENTS.md files, and Claude Code recommends fewer than 200 lines. This
file is a routing table: always applicable content stays here, in a few lines; the rest lives in separate files and
goes into the "Before starting" table.
-->

# <Project name>

<One or two sentences: what the system does and for whom.>

## Map

| App or folder | Role | Stack | README |
|---|---|---|---|
| `<apps/api>` | <public API> | <Python 3.13, FastAPI> | `<apps/api/README.md>` |
| `<apps/web>` | <web dashboard> | <TypeScript, Next.js> | `<apps/web/README.md>` |

- **Boundaries:** <who can call whom; what one app never imports from another>.
- **External integrations:** <service → client folder → official documentation in `docs/vendor/<service>`>.

## Commands

| For | Command |
|---|---|
| Install dependencies | `<pnpm install>` |
| Run locally | `<pnpm dev>` |
| Lint and typecheck | `<pnpm lint && pnpm typecheck>` |
| Tests for a path | `<pnpm test -- path>` |
| Build | `<pnpm build>` |

Locally, run only tests for what you changed; CI runs the full suite.

## Risk map

Overrides the generic list in the `risk-process` rule. The riskiest file in the change determines the level.

| Level | Paths |
|---|---|
| **High** | `<apps/api/payments/**>`, `<apps/api/auth/**>`, `<migrations/**>`, `<.github/workflows/**>`, `<infra/**>` |
| **Medium** | `<apps/*/src/**>` outside High-risk paths |
| **Low** | `<docs/**>`, `<**/*.md>`, `<public/**>` |

Critical areas with a higher coverage floor: <list or write "none">.

## Before starting

| If the task involves | Read or use |
|---|---|
| Any coding task | the `risk-triage` skill |
| High risk | the `security-surfaces` skill, only touched surfaces |
| <Integration with service X> | `<docs/vendor/x/README.md>` |
| <Visual interface> | <project design skill> |

## Project rules

Always apply and override generic kit and third-party (ECC) rules. Only what is specific to this project:

- <Example: all amounts in cents, type `Money`; never `float`.>
- <Example: interface text in pt-BR, code and commits in English.>

## Done

- <Project criterion beyond green CI, for example: migration tested on a database with data.>
- If an app's structure, role or flow changes, update its README in the same commit.
