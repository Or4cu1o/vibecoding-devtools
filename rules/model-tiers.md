# Models by role and risk

Model names change; this rule uses tiers. The concrete map (which model fills each tier today) belongs in the project
or the orchestrator configuration.

| Tier | Purpose | Examples |
|---|---|---|
| **Fast** | mechanical, high-volume work, Low risk | docs, CHANGELOG, formatting, renames, quick triage before choosing who executes (only keeps or raises risk) |
| **Standard** | everyday implementation and review, Medium risk | backend, frontend, bug fixes, code and security review |
| **Deep** | planning and decisions costly to get wrong, High risk | architecture, cross-app contracts, money data schemas, diagnosis of persistent failures |

- **Money, authentication and security never use the fast tier**, including reviews.
- **Escalation:** when the same task fails twice with the same approach, move up a tier to replan instead of persisting.
- **Second opinion** (another provider or cheaper model): treat it as a suggestion. If used for High-risk work,
  validation comes from a deep-tier model.
- **Frontend requiring visual judgment:** the model the project has validated for design; until validated, standard
  tier.
