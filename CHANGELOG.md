# Changelog

Notable changes to vibecoding-devtools. Format based on [Keep a
Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-05

### Added

- Kit hooks `secret-scan` and `maestri-protocol` for Claude Code, Codex and Antigravity, with installer registration
  controlled by the panel and `--hooks`. Secret scanning is on by default; protocol checks require the Maestri pack.
  Codex requires approval in `/hooks`. Uncertain input allows execution; missing or failing gitleaks only warns.

### Changed

- Kit content, installer, commands and documentation are now in English; the root `README.md` stays in pt-BR.
- Renamed rules to `risk-process`, `testing`, `model-tiers`, `context-on-demand`, `maestri-messaging` and
  `maestri-usage`; skills to `risk-triage` and `security-surfaces`, with English paths under `surfaces/`; docs to
  `cli-compatibility.md` and `installer.md`. Code now lives under `installer/`, with English module names, commands
  and flags; the validator
  is `scripts/validate-kit.mjs`. No Portuguese aliases are retained.
- ECC is no longer installed on Antigravity: no commands, rules or flattening. Codex keeps its ECC plugin and routes
  rules from the `common` package; Impeccable remains available on all three CLIs.

## [0.1.0] - 2026-11-04

### Added

- Complete installer: panel with `@clack/prompts` and flags; action plan with new, same, update or conflict status;
  conversions for Codex (`AGENTS.md` block with a 32 KiB budget) and Antigravity (`trigger:` and flattened ECC packages
  with rewritten links); pinned ECC and Impeccable versions; state with locking, atomic writes and hash-based
  uninstall. Tested end to end on Linux and Windows.
- `maestri-agent-cli`: where each CLI lists exact model identifiers and how to pass them at launch.

## [0.0.2] - 2026-11-04

### Added

- GitHub Actions CI: markdownlint, kit structure validation (`scripts/validate-kit.mjs`) and secrets scanning with
  gitleaks. Actions pinned by SHA and gitleaks hash verified.
- `CLAUDE.md` with conventions and verification for kit contributors.
- The `maestri-budget` skill and `maestri-usage` rule: the Maestro reads quota and context only at checkpoints,
  calculates each quota's pace to last the full cycle and end nearly empty, and distributes work across CLIs; clears
  context before an unrelated task and compacts only between tasks. Model changes only for Antigravity agents the
  user marks as managed.
- Installer, stage 1: `node installer/cli.mjs detect` checks Node, git, Claude Code, Codex and Antigravity (version,
  folder and whether outside PATH), and suggests ECC rule packages from the project stack. Tests run in CI on Linux
  and Windows.

### Changed

- Dual review (Claude and Codex), with counterproposals until consensus:
  - `risk-process`: consistent blocking rule (Minor blocks only at High risk; Critical and Major predating the PR
    await the owner's decision); coverage and baseline with a single scope; path for projects without CI or reviewers;
    parallel work only across independent areas; lightweight-model triage never lowers the level.
  - `base`: secrets scan over staged changes (`gitleaks git --pre-commit --staged --redact`) and consulting official
    documentation for changing platforms.
  - `context-on-demand` loads only when editing `AGENTS.md`, `CLAUDE.md`, rules or skills (`paths:`).
  - `maestri-usage` shortened; `maestri-budget` with correct pace bands (above 1.0, quota runs out before renewal) and
    decisions based on the tightest window; `maestri-protocol` recognizes the delegation footer.
  - Installer: detection distinguishes unresponsive CLIs, reads quoted PATH entries, detects gitleaks and explains
    unrecognized projects; specification with pinned versions in every command and flattened rules for Antigravity.
  - Validator accepts CRLF and BOM, rejects block `description` and checks English references; also runs on Windows.
    `.gitattributes` enforces LF.
- `maestri-agent-cli`: the Maestro records each agent's CLI and account in a `ledger.md` in its own session folder and
  consults it before acting; when the screen differs from the reference, trusts the screen and tells the user; the
  skill no longer loads on every `maestri check`. References include Antigravity's three quotas (Gemini, Claude and GPT,
  Argon) and where to read context in each CLI.
- Markdown within 120 columns, with a language on every code block.
- Installer specification finalized: Node ≥ 22, `@clack/prompts` panel, ECC rules copied by our installer (`common`
  globally on all three CLIs and `web` only on Claude Code), modular ECC without `rules-core`, ECC hooks disabled by
  default and `uninstall` in 0.1.0.

## [0.0.1] - 2026-10-29

### Added

- `README.md` with kit contents.
- Rules: `base`, `risk-process`, `testing`, `model-tiers`, `context-on-demand` and `maestri-messaging`.
- Skills: `risk-triage`, `security-surfaces` (money and value, accounts and data, inputs and services, secrets and
  infrastructure surfaces), `maestri-protocol` and `maestri-agent-cli` (references for Antigravity, Claude Code and
  Codex).
- Templates in `templates/`: `.coderabbit.yaml`, `AGENTS.md` (routing and risk map) and `CLAUDE.md` importing
  `AGENTS.md`.
- Hook ideas in `hooks/README.md`, including Maestri protocol header validation.
- `docs/cli-compatibility.md`: how Claude Code, Codex and Antigravity load instructions, rules, skills, hooks and
  agents.
- `docs/installer.md`: installer specification.

### Changed

- License from GPL-2.0 to MIT.
- Review findings now use Critical, Major, Minor and Suggestion; Low, Medium and High are reserved for task risk.
  The blocking rule lives only in `risk-process`.
