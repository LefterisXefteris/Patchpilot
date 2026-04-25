# State: Back To Service

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-25)

**Core value:** Production errors should move from detection to verified recovery with as little human intervention as safely possible.
**Current focus:** Phase 1 - Integration Foundation

## Current Milestone

**Milestone:** v1 autonomous Sentry-to-recovery loop
**Status:** Ready for phase planning
**Next command:** `$gsd-plan-phase 1`

## Phase Status

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Integration Foundation | Pending | 0% |
| 2 | Incident Intake and Issue Sync | Pending | 0% |
| 3 | Diagnosis Engine | Pending | 0% |
| 4 | Patch PR Loop | Pending | 0% |
| 5 | Autopilot Deploy and Recovery | Pending | 0% |
| 6 | Guardrails and Auditability | Pending | 0% |

## Active Decisions

- Start with Sentry + GitHub + Vercel.
- Build toward full autopilot.
- Use patch-first recovery, with rollback/redeploy/restart as fallbacks.
- Use GitHub Issues as the visible incident record.
- Enforce explicit safety policy and auditability before autonomous production mutation.

## Notes

- The repository was initialized as a new git repository on 2026-04-25.
- The previous `gsd-sdk query` interface was unavailable in this environment, so planning artifacts were created directly from the GSD workflow templates.
