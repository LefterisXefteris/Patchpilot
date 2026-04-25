# Roadmap: Back To Service

**Created:** 2026-04-25
**Granularity:** Standard
**Core Value:** Production errors should move from detection to verified recovery with as little human intervention as safely possible.

## Overview

| Phase | Name | Goal | Requirements | UI hint |
|-------|------|------|--------------|---------|
| 1 | Integration Foundation | Configure Sentry, GitHub, Vercel, secrets, and autopilot policy. | CONF-01, CONF-02, CONF-03, CONF-04 | no |
| 2 | Incident Intake and Issue Sync | Turn production Sentry issues into deduplicated GitHub recovery workflows. | INCD-01, INCD-02, INCD-03, INCD-04, GHI-01, GHI-02, GHI-03 | no |
| 3 | Diagnosis Engine | Correlate Sentry evidence with repository and Vercel deployment context to produce patch plans. | DIAG-01, DIAG-02, DIAG-03 | no |
| 4 | Patch PR Loop | Create branches, apply fixes, run verification, and open recovery PRs. | PTCH-01, PTCH-02, PTCH-03, PTCH-04 | no |
| 5 | Autopilot Deploy and Recovery | Merge eligible fixes, monitor Vercel deployment, verify Sentry recovery, and use fallbacks when needed. | PTCH-05, RECV-01, RECV-02, RECV-03, RECV-04, RECV-05, RECV-06 | no |
| 6 | Guardrails and Auditability | Make autonomous production mutation trustworthy through policy enforcement, dry-run, kill switch, redaction, and audit logs. | GHI-04, DIAG-04, CTRL-01, CTRL-02, CTRL-03, CTRL-04 | no |

## Phase Details

### Phase 1: Integration Foundation

**Goal:** Establish the configured control plane for Sentry, GitHub, Vercel, secrets, and autopilot policy.

**Requirements:** CONF-01, CONF-02, CONF-03, CONF-04

**Success Criteria:**
1. A user can configure Sentry, GitHub, and Vercel credentials and project identifiers.
2. The agent can validate access to each provider without mutating production.
3. Autopilot policy can express confidence threshold, protected paths, allowed actions, and emergency stop state.
4. Secrets are stored and accessed through a single safe configuration path.

### Phase 2: Incident Intake and Issue Sync

**Goal:** Convert production Sentry issues into one stable GitHub issue workflow with clear state and evidence.

**Requirements:** INCD-01, INCD-02, INCD-03, INCD-04, GHI-01, GHI-02, GHI-03

**Success Criteria:**
1. A production Sentry issue creates or updates exactly one matching GitHub issue.
2. The GitHub issue includes Sentry evidence, severity, affected users, release/deployment hints, and permalink.
3. Repeated events update the existing workflow instead of creating duplicates.
4. Non-production and low-signal issues are ignored or downgraded according to policy.

### Phase 3: Diagnosis Engine

**Goal:** Produce evidence-backed root-cause hypotheses and patch plans from Sentry, repository, commit, and Vercel context.

**Requirements:** DIAG-01, DIAG-02, DIAG-03

**Success Criteria:**
1. The agent identifies likely repository files and commits related to a Sentry stack trace.
2. The agent correlates the incident to active or recent Vercel production deployments.
3. The diagnosis includes evidence, confidence, affected surface, and a concrete patch plan.
4. The GitHub issue is updated with diagnosis status and reasoning.

### Phase 4: Patch PR Loop

**Goal:** Turn a high-confidence diagnosis into a small verified pull request.

**Requirements:** PTCH-01, PTCH-02, PTCH-03, PTCH-04

**Success Criteria:**
1. The agent creates an isolated fix branch linked to the incident.
2. The patch is scoped to the diagnosed failure and avoids unrelated refactors.
3. Configured verification commands run and their output is captured.
4. The PR explains the root cause, fix, Sentry evidence, verification result, and recovery plan.

### Phase 5: Autopilot Deploy and Recovery

**Goal:** Complete the patch-first production recovery loop and fall back to redeploy, rollback, or restart/recovery hooks when patching fails.

**Requirements:** PTCH-05, RECV-01, RECV-02, RECV-03, RECV-04, RECV-05, RECV-06

**Success Criteria:**
1. The agent merges eligible PRs only when checks pass and autopilot policy permits.
2. The agent tracks the resulting Vercel deployment to a terminal state.
3. The agent verifies recovery through Sentry recurrence and deployment health signals.
4. The GitHub issue is marked recovered only after production health passes.
5. The agent can trigger configured fallback recovery when patch/deploy verification fails.

### Phase 6: Guardrails and Auditability

**Goal:** Make autonomous production changes observable, reversible, and controllable.

**Requirements:** GHI-04, DIAG-04, CTRL-01, CTRL-02, CTRL-03, CTRL-04

**Success Criteria:**
1. Dry-run mode shows intended provider actions without mutating production.
2. A kill switch blocks autonomous merge, deploy, rollback, redeploy, and recovery hooks immediately.
3. Policy blocks low-confidence or disallowed file/action changes before they reach production.
4. Sensitive data is redacted before leaving internal logs.
5. Every decision and production mutation has a structured audit record and visible GitHub issue comment.

## Coverage Validation

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 1 | Pending |
| CONF-02 | Phase 1 | Pending |
| CONF-03 | Phase 1 | Pending |
| CONF-04 | Phase 1 | Pending |
| INCD-01 | Phase 2 | Pending |
| INCD-02 | Phase 2 | Pending |
| INCD-03 | Phase 2 | Pending |
| INCD-04 | Phase 2 | Pending |
| GHI-01 | Phase 2 | Pending |
| GHI-02 | Phase 2 | Pending |
| GHI-03 | Phase 2 | Pending |
| GHI-04 | Phase 6 | Pending |
| DIAG-01 | Phase 3 | Pending |
| DIAG-02 | Phase 3 | Pending |
| DIAG-03 | Phase 3 | Pending |
| DIAG-04 | Phase 6 | Pending |
| PTCH-01 | Phase 4 | Pending |
| PTCH-02 | Phase 4 | Pending |
| PTCH-03 | Phase 4 | Pending |
| PTCH-04 | Phase 4 | Pending |
| PTCH-05 | Phase 5 | Pending |
| RECV-01 | Phase 5 | Pending |
| RECV-02 | Phase 5 | Pending |
| RECV-03 | Phase 5 | Pending |
| RECV-04 | Phase 5 | Pending |
| RECV-05 | Phase 5 | Pending |
| RECV-06 | Phase 5 | Pending |
| CTRL-01 | Phase 6 | Pending |
| CTRL-02 | Phase 6 | Pending |
| CTRL-03 | Phase 6 | Pending |
| CTRL-04 | Phase 6 | Pending |

**Coverage:** 30/30 v1 requirements mapped.

---
*Roadmap created: 2026-04-25*
