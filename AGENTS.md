# AGENTS.md

## Project

Back To Service is an AI production recovery agent for Sentry + GitHub + Vercel. It detects production Sentry errors, keeps GitHub issues updated, diagnoses root cause, creates patch PRs, deploys through Vercel, verifies recovery, and uses rollback/redeploy/restart fallbacks when needed.

## Planning Source Of Truth

- Project context: `.planning/PROJECT.md`
- Requirements: `.planning/REQUIREMENTS.md`
- Roadmap: `.planning/ROADMAP.md`
- State: `.planning/STATE.md`
- Research: `.planning/research/SUMMARY.md`

Read these before planning or implementing a phase.

## Product Rules

- Patch-first recovery is the default path.
- Rollback, redeploy, and restart/recovery hooks are fallback actions.
- GitHub Issues are the visible incident record.
- Full autopilot is the product ambition, but production mutation must obey explicit policy.
- Every autonomous action needs evidence, confidence, and audit trail.
- Secrets and sensitive Sentry payload data must be redacted before being written to GitHub or logs.

## Engineering Rules

- Keep changes scoped to the active phase.
- Prefer least-privilege integration design for Sentry, GitHub, and Vercel.
- Treat provider APIs as external contracts; isolate them behind adapters.
- Add tests around incident deduplication, policy decisions, recovery decisions, and provider side effects.
- Never let test fixtures contain real tokens, Sentry payload secrets, customer data, or production identifiers.

## Next Step

Run `$gsd-plan-phase 1` to plan Integration Foundation.
