# Secrets and infrastructure

## Secrets

- Never in code, logs, messages, attachments, error reports, exception messages or client responses. For diagnostics,
  record only whether the value is present or absent.
- Connection URLs in logs have credentials masked (`postgres://***@host`).
- Every new sensitive variable is empty and documented in `.env.example`, and read by a single configuration loader.
- Configuration exports replace secrets with placeholders.
- Public exceptions (for example, a client ID in every authorization URL) only by explicit name and format validation;
  any value outside that format remains a secret.
- `.env`, local databases and caches stay outside git and Docker images (`.gitignore` and `.dockerignore`).

## Admin commands and subprocesses

- Arguments as lists; `shell=True` only in an admin shell command intended for that purpose.
- Minimal subprocess environment (allowlist such as `PATH`, `HOME`, `LANG`); never forward the entire environment.
- Admin command output has secrets masked and goes only to the admin, never to a public channel.
- `eval` and remote consoles disabled by default, enabled through configuration.
- Record every admin command execution (who, what, when), without secrets.
- Auto-update only from the official repository, by verified tag or commit, without silently discarding local changes.
- Restart through orderly shutdown and a nonzero exit code, letting the supervisor start it again; never kill
  unrelated PIDs.

## Binary and script downloads

- Version-pinned URL (immutable tag or release, never `main` or `latest`) and pinned SHA-256.
- Download to a temporary file, verify the hash, move atomically; a wrong hash deletes the file and aborts.
- HTTPS only, with `timeout`. No `curl | bash` or executing freshly downloaded scripts.

## Dependencies

- Exact version and hash in the lockfile, installation requiring hashes.
- Prefer official registry releases; git dependencies only pinned to a full commit SHA.
- Before adding: actual use, active maintenance, compatible license and audit without high or critical vulnerabilities.

## Docker, CI and scripts

- Base image pinned by digest, non-root user, no secrets in layers or `ARG`.
- Bash scripts with `set -euo pipefail`, quoted variables and no printing the environment.
- No secrets in compose or workflow YAML; use CI secrets or ignored local `.env`.
- GitHub Actions pinned by SHA, minimal `permissions:` and no `pull_request_target` executing PR code.
- New security options start with the safe value as default.
