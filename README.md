# Back To Service

Back To Service is an AI production recovery agent for a configured target app.

It watches Sentry-created GitHub issues in the target repo, fetches linked Sentry evidence when needed, triggers a configured repair workflow, and verifies whether production recovered through Vercel, HTTP health checks, and Sentry quieting. It can also query Sentry performance data for production bottlenecks and open optimization PR work for human review.

This repo is the **agent/control plane**. It does not fix itself. The broken application is a separate target repo.

```text
Agent repo:  LefterisXefteris/backToService
Target repo: LefterisXefteris/snapsyncai
Target app:  lisai-app on Vercel
Production:  https://www.snapsyncai.co.uk/
Sentry:      tribeagent / node-express / production
```

## What It Does Today

Current live flow:

```text
Sentry production error
-> Sentry GitHub integration creates a GitHub issue in the target repo
-> Back To Service watches eligible Sentry-created GitHub issues
-> Back To Service dispatches the target repo Claude workflow
-> Claude Code investigates the target repo and proposes a patch
-> Claude opens or updates a draft PR/branch
-> Vercel deploys after the fix reaches production
-> Back To Service verifies recovery
-> Back To Service closes, waits, retries, or escalates the incident issue
```

Performance intake uses a parallel conservative flow:

```text
Sentry production spans / transactions
-> Back To Service finds slow or regressed bottlenecks
-> Back To Service creates or updates a GitHub performance incident issue
-> Back To Service dispatches the repair worker with p75/p95/p99 and baseline context
-> The worker opens an optimization PR
-> Humans review before merge by default
```

The system has already handled real incidents in `snapsyncai`, including a frontend boot crash caused by reading `runtimeConfig.version` when runtime config was missing.

## Honest Boundaries

This is a guarded production recovery agent, not a reckless full-autopilot deploy bot.

- It expects Sentry to create the first incident issue.
- It updates accepted incident issues automatically.
- It can trigger Claude Code automatically.
- Claude can inspect, edit, test, build, and open a draft PR in the target repo.
- Back To Service can verify recovery and close recovered incident issues.
- It does **not** auto-merge PRs by default.
- It does **not** auto-rollback or mutate production infrastructure by default.
- The live code repair worker can be Claude Code or OpenAI Codex through target-repo GitHub Actions. Back To Service orchestrates the incident loop and keeps the audit trail.

One important Vercel setting: if Vercel has **Require Verified Commits** enabled, bot/API commits may be canceled before build because they are unverified. For this agent flow, that setting should be off unless you implement signed bot commits.

## Tools

Back To Service uses meaningful typed tools around real production systems:

| Tool | Purpose |
|---|---|
| `github_list_sentry_incident_issues` | Find existing GitHub issues with Sentry evidence. |
| `sentry_list_issues` | Legacy fallback for unresolved production Sentry polling. |
| `sentry_get_issue_event` | Fetch event evidence for diagnosis/evals. |
| Sentry performance intake | Query production spans for slow or regressed bottlenecks. |
| `github_find_or_create_incident_issue` | Deduplicate and record incidents in GitHub Issues. |
| `github_repository_dispatch_claude` | Trigger the configured repair worker in the target repo. |
| `vercel_get_latest_production_deployment` | Check the target production deployment. |
| `severity_calculator` | Score incident severity/confidence in the agent harness. |
| incident memory | Retrieve compact prior Sentry incident lessons from SQLite. |
| suspect-file mapping | Rank likely source files from Sentry stack frames and incident memory. |
| recovery deploy check | Verify latest Vercel production deployment is `READY`. |
| recovery health check | Verify the production URL responds with the expected status. |
| recovery Sentry check | Verify the Sentry issue is quiet or resolved. |

Claude Code then uses repo tools such as read, edit, search, `npm`, `git`, and `gh` inside the target repo workflow. When Back To Service can map Sentry frames to files, Claude is told to inspect those suspect files first and broaden search only if they do not explain the issue.

## Commands

Quality gates:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Validate provider access:

```bash
npm run validate:config
```

Watch existing Sentry-created GitHub Issues:

```bash
npm run agent:watch -- --limit 5
npm run agent:watch -- --apply --limit 5
```

Legacy fallback: poll Sentry and sync incidents to GitHub Issues:

```bash
npm run agent:sync -- --limit 5
npm run agent:sync -- --apply --limit 5
```

Poll Sentry performance data and sync bottlenecks to GitHub Issues:

```bash
npm run agent:performance -- --limit 5
npm run agent:performance -- --apply --limit 5
```

Redispatch Claude for existing incidents:

```bash
npm run agent:sync -- --apply --limit 5 --redispatch
```

Run the assignment-grade local agent loop:

```bash
npm run agent:run
npm run agent:run -- --db .back-to-service/agent-state.sqlite
```

Verify recovery for open incident issues:

```bash
npm run agent:recover -- --limit 5
npm run agent:recover -- --apply --limit 5
```

Run offline evals:

```bash
npm run eval
npm run eval -- --ablation
```

Start the local setup UI:

```bash
npm run ui
```

Print the target repo repair workflow templates:

```bash
npm run show:claude-workflow
npm run show:codex-workflow
```

## Incident Memory

Back To Service stores compact SQLite memory for Sentry-backed GitHub incidents. Memory is advisory only: the current GitHub issue and current Sentry event remain authoritative.

The memory layer stores short redacted lessons such as stack signature, root-cause summary, fix summary, outcome, and confidence. It does not store full Sentry payloads, raw GitHub issue bodies, secrets, stack locals, or full tool outputs.

During diagnosis, the agent retrieves at most a few similar lessons and formats them into a small "Relevant prior incidents" block. This reduces token use by replacing repeated old context with a compact hint, while still fetching current Sentry evidence.

Back To Service also maps Sentry stack frames and prior memory to a small suspect-file list. The dispatch payload can include paths such as `src/main.tsx` with a confidence score and reason, so the repair worker starts with a narrow file set instead of scanning the whole repo by default.

## Assignment 2 Mapping

Assignment:

> Build a real agent loop with multiple tools (>=3), state, error handling, observability, and a reproducible eval harness. LLM-driven tool selection. Clear tool schemas. Meaningful tools. Robust error handling and fallback. Eval harness with adversarial queries. Cost/latency tracking. Prompt ablation. Honest failure documentation.

How this project maps:

| Requirement | Status | Implementation |
|---|---:|---|
| Real agent loop | Yes | `agent:watch`, `agent:run`, and `agent:recover` implement GitHub issue intake, tool loop, repair dispatch, and verification. |
| Multiple tools `>=3` | Yes | Sentry, GitHub Issues, GitHub dispatch, Vercel, severity calculator, health check, Sentry quieting. |
| State | Yes | SQLite state in `src/state/sqlite-store.ts` stores incidents, runs, tool calls, decisions, metrics, eval results, recovery attempts, and compact incident memory. |
| Error handling | Yes | Structured error codes, dry-run mode, redaction, fallback decisions, retry/wait/escalate/close recovery policy. |
| Observability | Yes | JSON logs, SQLite traces, per-tool latency, decisions, estimated tokens/cost. |
| Reproducible eval harness | Yes | `npm run eval` runs offline fixture-based scenarios without real provider secrets. |
| Clear tool schemas | Yes | Tool definitions and schemas live in `src/agentic/tools.ts`. |
| Meaningful tools | Yes | Tools operate on production incident systems rather than toy examples. |
| Robust fallback | Yes | Non-production issues are ignored; weak evidence goes to human; Vercel failures do not crash eval path; recovery can wait/retry/escalate. |
| Cost/latency tracking | Yes | `src/agentic/observability.ts` estimates tokens/cost and records latency metrics. |
| Prompt ablation | Yes | Prompt variants live in `prompts/` and run with `npm run eval -- --ablation`. |
| Honest failure docs | Yes | See `docs/FAILURES.md`. |
| LLM-driven tool selection | Partial / honest | The offline Back To Service harness uses deterministic tool-path simulation for reproducible evals. Live LLM-driven code repair happens inside Claude Code or OpenAI Codex GitHub Actions, where the repair worker chooses repo/search/edit/test tools. |

The main improvement needed for a stricter interpretation of "LLM-driven tool selection" is adding a live model adapter to `agent:run --live` so Back To Service itself chooses tools through an LLM rather than a deterministic policy.

## Eval Harness

The eval harness is offline by default. It does not require real Sentry, GitHub, Vercel, or Anthropic secrets.

It covers adversarial and operational scenarios such as:

- Non-production Sentry issue should not trigger repair.
- Existing Sentry-created GitHub issue should be accepted without creating another issue.
- Missing Sentry event falls back to issue creation / human review.
- Secret-like values in payloads are redacted.
- Vercel API failure does not crash the run.
- Prompt injection in incident evidence cannot force rollback, merge, or secret disclosure.
- Low-confidence diagnosis chooses `needs_human`.
- Repeated synthetic crashes retrieve prior memory while still using current Sentry evidence.
- Repeated stack-frame crashes map directly to suspect files such as `src/main.tsx`.

Run:

```bash
npm run eval
npm run eval -- --ablation
```

The output includes pass/fail, selected tools, final decisions, latency, estimated cost, and failure reasons.

## Setup

Create `.env` from `.env.example`, or use the local UI:

```bash
npm run ui
```

Required local/provider configuration:

- Sentry GitHub integration configured in the target repo to create incident issues.
- Sentry token, org slug, project slug, environment, and region URL for evidence lookup.
- Optional Sentry performance intake config: `PERF_ENABLED`, `PERF_MIN_SAMPLE_COUNT`, `PERF_P95_THRESHOLD_MS`, `PERF_REGRESSION_RATIO`, and `PERF_ALLOWED_OPS`.
- GitHub App ID, private key, installation ID, agent repo, and target repo.
- Vercel token, team ID, agent project ID, and target Vercel project ID.
- Target production URL for recovery verification.

For the current target app, the important target values are:

```text
GITHUB_TARGET_OWNER=LefterisXefteris
GITHUB_TARGET_REPO=snapsyncai
BTS_TARGET_PRODUCTION_URL=https://www.snapsyncai.co.uk/
BTS_TARGET_VERCEL_PROJECT_ID=prj_ZVtToWfGUfAkTJp0qrexLyaPXEla
BTS_TARGET_SENTRY_PROJECT_SLUG=node-express
```

Do not commit `.env`. It is ignored.

## GitHub Actions Autopilot

The agent can run 24/7 through:

```text
.github/workflows/back-to-service-poll.yml
```

It runs every 5 minutes because GitHub scheduled workflows are not suitable for 2-minute polling.

Back To Service repo secrets:

```text
SENTRY_AUTH_TOKEN
BTS_GITHUB_APP_ID
BTS_GITHUB_APP_PRIVATE_KEY
BTS_GITHUB_INSTALLATION_ID
BTS_GITHUB_TARGET_INSTALLATION_ID
VERCEL_TOKEN
```

Back To Service repo variables:

```text
SENTRY_ORG_SLUG
SENTRY_PROJECT_SLUG
SENTRY_ENVIRONMENT
SENTRY_REGION_URL
BTS_GITHUB_OWNER
BTS_GITHUB_REPO
BTS_GITHUB_TARGET_OWNER
BTS_GITHUB_TARGET_REPO
VERCEL_PROJECT_ID
VERCEL_TEAM_ID
BTS_TARGET_PRODUCTION_URL
BTS_TARGET_HEALTH_CHECK_PATH
BTS_TARGET_HEALTH_CHECK_STATUS
BTS_TARGET_HEALTH_CHECK_TIMEOUT_MS
BTS_TARGET_VERCEL_PROJECT_ID
BTS_TARGET_VERCEL_TEAM_ID
BTS_TARGET_SENTRY_PROJECT_SLUG
BTS_RECOVERY_MAX_ATTEMPTS
BTS_RECOVERY_PARTIAL_TOLERANCE
BTS_RECOVERY_MIN_DEPLOY_AGE_SECONDS
BTS_RECOVERY_NEEDS_HUMAN_LABEL
BTS_RECOVERY_RESOLVED_LABEL
```

See `docs/GITHUB_ACTIONS_AUTOPILOT.md` for more detail.

## Target Repo Claude Workflow

The target repo needs one repair workflow. For Claude:

```text
.github/workflows/back-to-service-claude.yml
```

Generate the template with:

```bash
npm run show:claude-workflow
```

For OpenAI Codex:

```text
.github/workflows/back-to-service-codex.yml
```

Generate the template with:

```bash
npm run show:codex-workflow
```

Set `BTS_REPAIR_PROVIDER=codex` in the Back To Service environment so dispatch uses the Codex-specific repository event.

The target repo also needs the matching provider secret:

```text
ANTHROPIC_API_KEY
OPENAI_API_KEY
```

as a GitHub Actions secret for whichever repair provider is installed.

The Claude workflow is intentionally constrained:

- It should open a draft PR.
- It should not merge.
- It should not deploy.
- It should not rollback.
- It should not expose secrets.
- It should prefer the smallest safe patch.

## Recovery Decisions

`agent:recover` scans open target repo incident issues and decides:

| Decision | Meaning |
|---|---|
| `close` | Deployment, health, and Sentry quieting indicate recovery. |
| `wait` | Recovery is partial or deployment is too fresh. |
| `retry` | Still failing and retry budget remains, so dispatch Claude again. |
| `escalate` | Evidence is unclear, repeated partial recovery, or retries are exhausted. |

## Safety

- `.env` is ignored and must not be committed.
- Secrets and sensitive incident payloads are redacted before logs/traces where possible.
- Autopilot actions are controlled by `AUTOPILOT_ALLOWED_ACTIONS`.
- Production mutation is intentionally limited.
- Existing issues are not redispatched every cron run unless `--redispatch` is used.

## Known Limitations

See `docs/FAILURES.md`.

The short version:

- Back To Service's local eval planner is deterministic today.
- Live LLM repair is delegated to the configured target-repo repair workflow: Claude Code by default, or OpenAI Codex when `BTS_REPAIR_PROVIDER=codex`.
- Auto-merge is intentionally disabled.
- Sentry source-map/release-to-commit correlation is future work.
- Cost tracking is estimated, not provider-billed.
- GitHub Actions SQLite state is ephemeral unless external persistence is added.
