# Roadmap: Back To Service

**Created:** 2026-04-25  
**Revised:** 2026-05-10  
**Core Value:** Production errors should move from detection to verified recovery with as little human intervention as safely possible.

## Lean Direction

Back To Service now assumes Sentry's GitHub integration owns first-line incident intake and basic GitHub issue creation. The agent starts from existing Sentry-created GitHub issues, enriches them only when needed, diagnoses root cause, creates patch PRs, verifies recovery, and later proposes improvements to itself.

This avoids spending agent effort on workflows Sentry and GitHub already cover.

## Overview

| Phase | Name | Goal | UI hint |
|-------|------|------|---------|
| 1 | Integration Foundation | Configure least-privilege GitHub, Sentry evidence lookup, Vercel verification, secrets, and autopilot policy. | no |
| 2 | GitHub Issue Watcher | Watch Sentry-created GitHub issues and accept eligible production incidents for diagnosis. | no |
| 3 | Diagnosis Engine | Correlate linked Sentry evidence with repository and Vercel deployment context to produce patch plans. | no |
| 4 | Patch PR Loop | Create scoped branches, fixes, checks, and incident-linked PRs. | no |
| 5 | Verify and Recover | Track deployments, verify recovery, and use allowed fallbacks only when policy permits. | no |
| 6 | Guardrails and Audit | Make autonomous production mutation observable, reversible, redacted, and policy-bound. | no |
| 7 | Self-Evolution PRs | Learn from failed recoveries and open Back To Service improvement PRs. | no |

## Phase Details

### Phase 1: Integration Foundation

**Goal:** Keep the configured control plane, but narrow each provider to the work the agent truly needs.

**Success Criteria:**
1. GitHub credentials can read target incident issues, comment, create branches/PRs, and dispatch workers.
2. Sentry credentials fetch issue/event evidence from IDs or links found in GitHub issues.
3. Vercel credentials support deployment lookup, verification, and configured fallback recovery.
4. Autopilot policy expresses dry-run, confidence threshold, protected paths, allowed actions, and emergency stop.

### Phase 2: GitHub Issue Watcher

**Goal:** Use Sentry-created GitHub issues as the incident entrypoint.

**Success Criteria:**
1. The watcher reads target-repo GitHub issues and parses Sentry markers, short IDs, or permalinks.
2. It accepts production Sentry issues with labels/title/body evidence or manual diagnosis approval.
3. It ignores issues without Sentry evidence, non-production issues, and duplicates in the same batch.
4. Accepted issues get a lightweight Back To Service status comment and optional repair-worker dispatch when policy allows.

### Phase 3: Diagnosis Engine

**Goal:** Produce evidence-backed root-cause hypotheses and patch plans from linked Sentry, compact prior incident memory, and deployment context.

**Success Criteria:**
1. The agent fetches Sentry issue/event details from the linked GitHub issue.
2. It retrieves only compact, redacted prior incident lessons from SQLite as advisory context.
3. It maps Sentry stack frames and memory to a ranked suspect-file list so repair starts narrow.
4. It identifies likely repository files and commits from stack frames and release metadata.
5. It correlates incidents to active or recent Vercel production deployments.
6. It comments diagnosis, confidence, affected surface, and a concrete patch plan on the existing issue.

### Phase 4: Patch PR Loop

**Goal:** Turn high-confidence diagnoses into small verified pull requests.

**Success Criteria:**
1. The configured repair worker creates an isolated incident-linked branch.
2. The patch is scoped to the diagnosed failure and avoids unrelated refactors.
3. Configured checks run and their output is captured.
4. The PR links the GitHub issue and Sentry issue and includes evidence, verification, and risk.

### Phase 5: Verify and Recover

**Goal:** Follow the fix into production only when policy allows.

**Success Criteria:**
1. The agent tracks the Vercel deployment produced by a merged fix.
2. It verifies recovery through deployment health and Sentry recurrence.
3. It comments recovery status on the GitHub issue.
4. It uses redeploy, rollback, or recovery hooks only when explicitly allowed.
5. It never marks recovered until production signals pass.

### Phase 6: Guardrails and Audit

**Goal:** Make autonomous behavior trustworthy before expanding it.

**Success Criteria:**
1. Every decision, tool call, provider action, and production mutation has a structured audit record.
2. Sentry payloads and secrets are redacted before GitHub comments, logs, PRs, or stored traces.
3. Dry-run mode reports intended actions without mutation.
4. The kill switch blocks merge, deploy, rollback, redeploy, and recovery hooks.
5. Policy refuses low-confidence patches, protected paths, oversized diffs, and unsafe actions.

### Phase 7: Self-Evolution PRs

**Goal:** Let Back To Service improve itself through reviewed PRs, not autonomous self-deploys.

**Success Criteria:**
1. Failed recoveries, `needs_human` outcomes, repeated fallbacks, and failed evals become improvement signals.
2. The agent proposes prompt, policy, and eval changes with evidence, confidence, and risk.
3. Evals and quality gates pass before a self-improvement PR is opened.
4. Self-improvement PRs are never auto-merged in v1.

## Removed or Reduced Scope

- No agent-owned creation of first GitHub incident issues from Sentry in the default v1 path.
- No duplicate Sentry polling workflow except as an explicit legacy/fallback command.
- No custom incident database as the user-facing source of truth.
- No broad triage of unrelated GitHub issues.
- No autonomous production mutation until policy and audit phases are complete.

---
*Last updated: 2026-05-10 after lean GitHub-issue-first roadmap revision*
