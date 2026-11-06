# Rule and skill rationale

Maintainer metadata. Keep this rationale outside loaded rules and skills.

## Testing

Source: [testing rule](../rules/testing.md).

**Problem solved:** huge suites that lock down structure instead of protecting behavior (thousands of tests and many
lines of tests per production line in one release). **Cost avoided:** CI minutes per PR and tokens spent writing,
maintaining and rereading low-value tests.

**Review date:** 2026-11-06. **Review this rule:** every six months; next review on 2027-05-06.

## Models by role and risk

Source: [model-tiers rule](../rules/model-tiers.md).

**Problem solved:** using the most expensive model for everything, or the cheapest where money is involved.
**Cost avoided:** deep-model tokens on mechanical tasks.

**Review date:** 2026-11-06. **Review this rule:** with each new model generation.

## Context on demand

Source: [context-on-demand rule](../rules/context-on-demand.md).

**Problem solved:** large rules loaded into every conversation, even when the task does not touch their topic.
**Cost avoided:** context tokens in every message from every agent.

**Review date:** 2026-11-06.

## Security surfaces

Source: [security-surfaces skill](../skills/security-surfaces/SKILL.md).

**Problem solved:** gaps involving money, data or access. **Cost avoided:** reviewing everything on every change;
this skill applies only at High risk (the risk-process rule) and only to touched surfaces.

**Review date:** 2026-11-06.
