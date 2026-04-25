# Research Summary: Back To Service

**Date:** 2026-04-25
**Domain:** AI production recovery agent for Sentry + GitHub + Vercel

## Key Findings

**Stack:** Use Sentry as the incident trigger and evidence source, GitHub as the work and code-change surface, and Vercel as the deployment and recovery surface. This gives the product a tight closed loop: observe -> diagnose -> patch -> deploy -> verify.

**Table Stakes:** The product needs Sentry issue/event ingestion, GitHub issue sync, repo-aware diagnosis, PR creation, CI/check awareness, Vercel deployment monitoring, rollback fallback, and an audit trail. Without those, it is only an alert summarizer, not a recovery agent.

**Watch Out For:** The biggest risk is unsafe autonomy. Autopilot must be constrained by explicit policies: confidence thresholds, protected paths, maximum blast radius, allowed recovery commands, deployment health checks, and an emergency stop.

## Source Notes

- Sentry exposes issue and event APIs for retrieving project issues, issue events, and event details. Relevant docs: https://docs.sentry.io/api/events/
- Sentry integrations can receive alert-rule webhooks when configured as alert actions. Relevant docs: https://docs.sentry.io/product/integrations/integration-platform/
- GitHub REST APIs support managing issues and pull requests, including creating issues, creating PRs, and merging PRs. Relevant docs: https://docs.github.com/en/rest/issues and https://docs.github.com/en/rest/pulls/pulls
- Vercel supports deployments through Git, CLI, deploy hooks, and REST API; deployment APIs can list production deployments and deployment events. Relevant docs: https://vercel.com/docs/deployments and https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments
- Vercel rollback can restore a previous production deployment, with plan-dependent limits and stale-configuration caveats. Relevant docs: https://vercel.com/docs/cli/rollback and https://vercel.com/docs/deployments/instant-rollback

## Recommended Shape

1. Receive a Sentry production alert or poll unresolved production issues.
2. Fetch the Sentry issue, latest/recommended event, stack trace, tags, release, affected users, and permalink.
3. Create or update one GitHub issue per Sentry issue with stable labels and agent status.
4. Correlate Sentry release/deployment metadata to GitHub commits and Vercel production deployments.
5. Diagnose root cause and generate a patch plan with confidence and evidence.
6. Create a branch, apply the patch, run checks, open a PR, and update the GitHub issue.
7. Merge automatically only when the configured autopilot policy allows it and checks pass.
8. Monitor the Vercel deployment and Sentry recurrence after merge.
9. If the patch path fails or worsens production, use configured fallback recovery: redeploy, rollback, or restart/recover an allowlisted hook.

## Research Confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Sentry as incident/evidence source | High | Issue and event APIs are a direct fit. |
| GitHub as workflow surface | High | Issues and PR APIs align with the desired user workflow. |
| Vercel as deployment/recovery surface | High | Deployment and rollback docs support the target flow. |
| Fully autonomous merge/deploy | Medium | Technically feasible, but requires strong policy and audit design. |
| Restart/recover infrastructure | Medium | Vercel itself has limited "restart" semantics; v1 should model this as allowlisted recovery hooks where needed. |
