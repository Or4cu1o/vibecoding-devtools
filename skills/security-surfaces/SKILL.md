---
name: security-surfaces
description: Surface-based security checklist for High-risk work - money and value (payments, balances, sales, trades), accounts and personal data, exposed inputs and services, secrets and infrastructure. Use when writing the contract, threat model or review of a High-risk item; load only the surfaces the change touches.
---

# Security review

## Steps

1. List the surfaces the change touches (the `risk-triage` skill).
2. Read **only** the files for those surfaces:

   | Surface | File | When |
   |---|---|---|
   | Money and value | `surfaces/money.md` | payments, payment methods, financial platforms, balances, wallets, sales, subscriptions, user trades, refunds |
   | Accounts and personal data | `surfaces/accounts-and-data.md` | signup, login, sessions, roles, admin, user data |
   | Inputs and services | `surfaces/inputs-and-services.md` | HTTP APIs, WebSocket, incoming webhooks, uploads, published messages, external data |
   | Secrets and infrastructure | `surfaces/secrets-and-infra.md` | tokens and keys, admin commands, subprocesses, downloads, dependencies, Docker, CI |

3. **Contract:** copy applicable items as completion criteria. **Threat model:** only for these surfaces.
4. **Review:** for each applicable item, Pass or a finding with severity (Critical, Major, Minor or Suggestion),
   `file:line`, abuse scenario and fix.
5. **Triage:** decide according to the **Findings** section of the `risk-process` rule.
6. Never describe an unfixed flaw in a public issue, PR, commit or document.

## Tools

Secrets scanning (`gitleaks git --pre-commit --staged`, `gitleaks git` for history and `gitleaks dir`), dependency
audits
with the project's package manager (`pnpm audit`, `npm audit`, `uvx pip-audit`, `govulncheck`), and risk tests listed in
each surface.
