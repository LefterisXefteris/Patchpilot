# Requirements: Back To Service

**Defined:** 2026-04-25
**Core Value:** Production errors should move from detection to verified recovery with as little human intervention as safely possible.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Configuration

- [ ] **CONF-01**: User can configure Sentry organization, project, environment, and authentication for production issue access.
- [ ] **CONF-02**: User can configure a GitHub repository through a least-privilege GitHub App or token.
- [ ] **CONF-03**: User can configure a Vercel project/team for deployment lookup, deployment monitoring, and rollback fallback.
- [ ] **CONF-04**: User can define autopilot policy including confidence threshold, protected paths, allowed actions, and emergency stop.

### Incident Intake

- [ ] **INCD-01**: Agent discovers existing Sentry-created GitHub issues that need recovery action.
- [ ] **INCD-02**: Agent parses linked Sentry issue IDs, short IDs, or permalinks from GitHub issue title/body metadata.
- [ ] **INCD-03**: Agent ignores or downgrades non-production, missing-evidence, and low-signal issues according to policy.
- [ ] **INCD-04**: Agent deduplicates GitHub issue and Sentry issue pairs into one active recovery workflow.

### GitHub Issues

- [ ] **GHI-01**: Sentry's GitHub integration creates the first incident issue; Back To Service treats that as a prerequisite instead of duplicating it.
- [ ] **GHI-02**: Agent updates the existing GitHub issue as intake acceptance, diagnosis, PR, deployment, verification, and fallback actions progress.
- [ ] **GHI-03**: Agent recognizes stable labels/title/body patterns for state, severity, source, confidence, and autopilot action.
- [ ] **GHI-04**: Agent records all autonomous decisions and actions as auditable GitHub issue comments.

### Diagnosis

- [ ] **DIAG-01**: Agent correlates Sentry release and stack frames with repository files and recent commits.
- [ ] **DIAG-02**: Agent correlates the incident with the active or recent Vercel production deployment.
- [ ] **DIAG-03**: Agent produces a root-cause hypothesis with confidence, evidence, and a patch plan.
- [ ] **DIAG-04**: Agent refuses autonomous patching when evidence is insufficient or policy blocks the affected files/actions.

### Patch Workflow

- [ ] **PTCH-01**: Agent creates an isolated branch for an approved autonomous fix attempt.
- [ ] **PTCH-02**: Agent applies the smallest reasonable code change that addresses the diagnosed production error.
- [ ] **PTCH-03**: Agent runs the configured verification commands before opening or merging the PR.
- [ ] **PTCH-04**: Agent opens a pull request linking the Sentry issue and GitHub incident issue with diagnosis, patch summary, and verification output.
- [ ] **PTCH-05**: Agent merges the PR automatically only when checks pass and autopilot policy permits the action.

### Deployment and Recovery

- [ ] **RECV-01**: Agent tracks the Vercel deployment produced by the merged fix.
- [ ] **RECV-02**: Agent verifies recovery by monitoring deployment status and Sentry recurrence after the fix ships.
- [ ] **RECV-03**: Agent marks the GitHub issue recovered only after production health signals pass.
- [ ] **RECV-04**: Agent triggers configured fallback recovery when patching fails, deployment fails, or production worsens.
- [ ] **RECV-05**: Agent can initiate Vercel rollback when policy allows and a safe rollback candidate exists.
- [ ] **RECV-06**: Agent can run allowlisted redeploy or restart/recovery hooks when configured for the project.

### Control and Audit

- [ ] **CTRL-01**: User can run the agent in dry-run mode to see intended actions without production mutation.
- [ ] **CTRL-02**: User can disable autopilot immediately through a kill switch.
- [ ] **CTRL-03**: Agent stores a structured audit record for every incident, decision, tool call, and production mutation.
- [ ] **CTRL-04**: Agent redacts secrets and sensitive payload data before writing GitHub comments, issues, PRs, or logs.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Providers

- **PROV-01**: Agent supports deployment providers beyond Vercel.
- **PROV-02**: Agent supports monitoring providers beyond Sentry.
- **PROV-03**: Agent supports multiple repositories and monorepos with service ownership mapping.

### Collaboration

- **COLL-01**: Agent supports Slack or Discord incident notifications.
- **COLL-02**: Agent supports human approval workflows for selected risk levels.
- **COLL-03**: Agent supports post-incident report generation.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Non-Vercel deployment providers | Focus v1 on one deployment control plane. |
| ChatOps as the primary workflow | GitHub Issues is the requested and initial user-facing surface. |
| Unbounded infrastructure mutation | Production recovery must use allowlisted actions only. |
| Fully generic bug fixing | v1 targets production errors with concrete Sentry evidence. |
| Agent-owned first issue creation | Sentry's GitHub integration already creates GitHub issues; the agent should begin from those issues by default. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CONF-03 | Phase 1 | Complete |
| CONF-04 | Phase 1 | Complete |
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

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-04-25*
*Last updated: 2026-04-25 after roadmap creation*
