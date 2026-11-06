# vibecoding-devtools

Kit of rules, skills, hooks and templates for AI development in Claude Code, Codex and Antigravity. This file applies
to work on the kit itself; the project template is in `templates/AGENTS.md`.

## Conventions

- **Generic:** no project, person or company names. The only dependencies mentioned are ECC and Impeccable.
- **Source:** Claude Code format is the source; conversions for Codex and Antigravity follow
  `docs/cli-compatibility.md`. If loading behavior changes, update that file.
- **Language:** English, except the root `README.md`, which stays in pt-BR.
- **Markdown:** lines up to 120 characters, compact tables (`|---|`) and code blocks always with a language.
- **Rules:** one topic per file in `rules/`, short and always applicable; long checklists become skills.
- **Skills:** `skills/<name>/SKILL.md`, with `name` matching the folder name and `description` on one line. Other fields
  apply only to Claude Code.
- **References:** a cited rule or skill (the `testing` rule, the `risk-triage` skill) must exist in the kit.
- **Findings and risk:** the scale and blocking rule live only in `risk-process`; other files refer to it.

## Versions

SemVer with tag `vX.Y.Z`. Every change goes under `[Unreleased]` in `CHANGELOG.md`, in the same commit; on release,
the section becomes `[X.Y.Z] - YYYY-MM-DD`. Conventional Commits.

## Verification

The same checks CI runs, before every commit:

```bash
npx markdownlint-cli2@0.24.0 "**/*.md"
node scripts/validate-kit.mjs
npm test
gitleaks git --pre-commit --staged --redact --no-banner
```
