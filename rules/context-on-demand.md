---
paths:
  - "**/AGENTS.md"
  - "**/CLAUDE.md"
  - "**/GEMINI.md"
  - "**/SKILL.md"
  - ".claude/rules/**"
  - ".agents/rules/**"
---

# Context on demand

- The project's `CLAUDE.md` and `AGENTS.md` are a **routing table**: "if the task involves X, read file Y".
  Short, always applicable rules stay there; large rules live in their own files and are read only when the task
  touches their topic.
- Automatically path-loaded rules (`paths:` in frontmatter) are only for narrow patterns. A pattern like `**/*.py`
  loads the rule for almost every task; prefer the table or a skill in that case.
- Long checklists used only at High risk become a **skill**: only the description stays in context, and the body loads
  when used.
- **One source** for Claude Code and other agents (Antigravity, Codex). Two manual copies (`.claude/rules` and
  `.agents/rules`) drift over time; generate one from the other.
- Official documentation for changing platforms (Discord, payment providers) is cloned or referenced in the
  repository, with a table row saying when to consult it.
- The project's risk map belongs in the same table: which folders are High risk (money, accounts, data, secrets,
  deploy).
