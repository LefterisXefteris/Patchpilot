# Back To Service

## What This Is

Back To Service is an AI production recovery agent for teams using Sentry, GitHub, and Vercel. It starts from Sentry-created GitHub issues, fetches linked Sentry evidence when needed, diagnoses the likely root cause, patches the target repository, opens and manages a pull request, follows the existing GitHub-to-Vercel deployment flow, and verifies that production recovers.

The long-term ambition is full autopilot: when confidence is high and policy allows it, the agent can patch, merge, deploy, and recover production without waiting for a human. The initial stack target is Sentry + GitHub + Vercel.

## Core Value

Production errors should move from detection to verified recovery with as little human intervention as safely possible.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] Watch Sentry-created GitHub issues and decide whether they require recovery action.
- [ ] Add agent status and diagnosis updates to existing GitHub issues with Sentry context, severity, affected users, logs, and evidence.
- [ ] Diagnose likely root cause by combining Sentry events, stack traces, Vercel deployments, commits, and repository context.
- [ ] Prefer a patch-first recovery path: produce a code fix, run verification, open a pull request, merge when confidence and policy gates pass, and deploy through Vercel.
- [ ] Use fallback recovery actions when patching is too risky, too slow, or fails verification: rollback, redeploy, or restart/recover supported infrastructure surfaces.
- [ ] Verify recovery after deployment by monitoring Sentry and deployment health signals.
- [ ] Keep a full audit trail of agent decisions, actions, confidence, evidence, and production changes.
- [ ] Enforce explicit autopilot guardrails for permissions, confidence thresholds, protected files, rollback conditions, and emergency stop.

### Out of Scope

- Multi-provider deployment support beyond Vercel in v1 - first release should deeply support one production path before generalizing.
- Non-production Sentry noise handling as a primary workflow - v1 focuses on production recovery.
- ChatOps-only incident management - GitHub Issues is the system of record for v1.
- Arbitrary infrastructure mutation - v1 can only use allowlisted Vercel/GitHub/Sentry actions and explicitly configured recovery hooks.

## Context

The user wants an AI agent that sees Sentry-created GitHub issues and, if there is an error in production, "brings it back." The clarified behavior avoids rebuilding Sentry/GitHub issue creation and focuses the agent on diagnosis, patch PRs, verification, fallback recovery, and later self-improvement PRs.

The target product behavior is autopilot, not only advisory. The agent should act when confidence is high. The chosen recovery strategy is patch-first: diagnose the Sentry error, create and merge a fix PR, deploy it, and use rollback/redeploy/restart only when patching is unsafe, slow, or unsuccessful.

The initial ecosystem is:

- **Sentry** for production error detection, issue/event details, stack traces, affected users, and alert triggers.
- **GitHub** for issues, pull requests, branches, checks, reviews, audit history, and source control.
- **Vercel** for deployments, production promotion, deployment logs, health state, and rollback.

## Constraints

- **Tech stack**: Sentry + GitHub + Vercel first - these integrations define the v1 control plane.
- **Safety**: Full autopilot must still be policy-driven - the agent needs confidence gates, allowlists, reversible actions, and a kill switch.
- **Recovery order**: Patch-first for v1 - rollback/redeploy/restart are fallback actions, not the default first move.
- **Source of truth**: GitHub Issues track incident state - Sentry creates the first issue, and the agent comments/acts from that existing workflow.
- **Production scope**: Production errors are the priority - staging and development noise should not trigger autonomous recovery.
- **Auditability**: Every action must explain what evidence was used and why the action was allowed.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Start with Sentry + GitHub + Vercel | User named this as the initial stack, and it gives a complete observe-code-deploy loop. | - Pending |
| Build toward full autopilot | User chose autopilot after considering guarded auto-recovery. | - Pending |
| Use patch-first recovery | User chose patching before rollback, making code repair the core behavior. | - Pending |
| Keep GitHub Issues as the visible incident record | User described Sentry logs on GitHub issues; this keeps the workflow where engineers already work. | - Pending |
| Use Sentry's GitHub integration for first issue creation | Avoids wasting agent work on a workflow Sentry can already handle. | Accepted 2026-05-10 |
| Require explicit safety policy despite autopilot | Production mutation needs confidence gates, audit logs, and emergency stop to be trustworthy. | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-25 after initialization*
