# Base

Apply to every project and risk level. These take precedence over process rules in a conflict.

- **Secrets:** never write, print or commit secrets, tokens or `.env`; use `.env.example`. Before every commit, scan
  what will be included: `gitleaks git --pre-commit --staged --redact` (without git: `gitleaks dir <files>`).
- **Changing platforms:** consult official documentation (cloned or referenced in the project) before assuming
  behavior from memory.
- **Git:** branch `type/short-name` from main, Conventional Commits, merge commit. Never push directly to main,
  force-push or rewrite shared history. Push, PR and merge require the owner's OK.
- **Destructive or external actions** (delete data or repositories, deploy, publish packages, release tags, change
  CI secrets or GitHub settings): require the owner's explicit OK. Once approved, whoever has the role executes;
  do not hand the command back to the owner to run.
- **Dependencies:** use the repository lockfile's package manager (pnpm by default; Python via uv, never global pip).
  Check license and maintenance before adding a package.
- **Interface design:** visual decisions belong to impeccable; web engineering rules handle quality, not visual
  direction.
- **Verify before claiming:** run lint, typecheck and tests for what you changed, and report failures honestly. Never
  claim a check you have not observed.
- **Delegation:** do quick work yourself, as well as work the owner assigned to you. Delegate independent work that
  benefits from parallel execution, with a short request stating the risk level.
- **Stop and flag:** if a task seems to require violating an architecture, economy, security or app boundary rule,
  stop and tell the owner before working around it.
- **Commits:** one commit per complete unit of work or when switching tasks, not after every edit.
- **App README:** if an app's structure, role or flow changes, update that app's `README.md` in the same commit.
