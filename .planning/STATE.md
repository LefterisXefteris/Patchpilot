# State: Patchpilot

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-25)

**Core value:** Production errors should move from detection to verified recovery with as little human intervention as safely possible.
**Current focus:** Phase 2 - GitHub Issue Watcher and Performance Intake

## Current Milestone

**Milestone:** v1 autonomous Sentry-to-recovery loop
**Status:** Phase 1 complete
**Next command:** Implement and harden GitHub issue watcher against live target-repo issue data.

## Phase Status

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Integration Foundation | Complete | 100% |
| 2 | GitHub Issue Watcher and Performance Intake | In Progress | 45% |
| 3 | Diagnosis Engine | Pending | 0% |
| 4 | Patch PR Loop | Pending | 0% |
| 5 | Verify and Recover | Pending | 0% |
| 6 | Guardrails and Auditability | Pending | 0% |
| 7 | Self-Evolution PRs | Pending | 0% |

## Active Decisions

- Start with Sentry + GitHub + Vercel.
- Build toward full autopilot.
- Use patch-first recovery, with rollback/redeploy/restart as fallbacks.
- Use GitHub Issues as the visible incident record.
- Rely on Sentry's GitHub integration to create first incident issues; Patchpilot watches and acts on eligible existing issues.
- Treat Sentry performance bottlenecks as conservative incidents: create/update GitHub issues, dispatch optimization PR work, and keep merge human-gated by default.
- Store compact redacted incident memory in SQLite first; memory is advisory during diagnosis and current Sentry/GitHub evidence remains authoritative.
- Enforce explicit safety policy and auditability before autonomous production mutation.

## Notes

- The repository was initialized as a new git repository on 2026-04-25.
- The previous `gsd-sdk query` interface was unavailable in this environment, so planning artifacts were created directly from the GSD workflow templates.
- Phase 1 planning completed on 2026-04-25 with 3 plans across 3 waves. Plan checker found 0 blockers and 2 accepted scope warnings.
- Phase 1 execution completed on 2026-04-25. Verification passed: typecheck, lint, tests, build, and safe invalid-config CLI behavior.
- On 2026-05-10, the roadmap was revised to avoid duplicating Sentry/GitHub issue creation. The default agent entrypoint is now GitHub issue watching; Sentry polling remains a legacy/fallback command.
- On 2026-05-10, SQLite incident memory was added for compact synthetic Sentry lessons, similarity retrieval, and bounded advisory context to reduce repeated diagnosis tokens.
- On 2026-05-11, OpenAI Codex was added as an alternate target-repo repair worker through `BTS_REPAIR_PROVIDER=codex`, alongside the existing Claude workflow.
- On 2026-05-13, Sentry performance bottleneck intake was added behind `PERF_ENABLED`, with GitHub performance incident sync, repair dispatch payloads, and performance verification checks.
