# Back To Service

Back To Service is an AI production recovery agent for a configured target app. It watches Sentry production errors, writes the incident into the target GitHub repo, triggers a Claude Code repair workflow, and keeps an auditable local/offline agent loop for evaluation.

## Current Target Model

Back To Service is the control repo. It does not fix itself.

```text
Agent repo:  LefterisXefteris/backToService
Target repo: LefterisXefteris/snapsyncai
Target app:  configured Sentry project + Vercel production project
```

The intended production flow is:

```text
Sentry production error
-> Back To Service polls Sentry
-> Back To Service creates/updates a GitHub issue in the target repo
-> the target repo issue opens/reopens
-> Claude Code GitHub Action runs in the target repo
-> Claude opens a draft PR with a proposed fix
```

## What Works So Far

- Validates Sentry, GitHub App, and Vercel access with `npm run validate:config`.
- Polls unresolved Sentry production issues with `npm run agent:sync`.
- Deduplicates each Sentry issue into one GitHub issue using a hidden marker.
- Separates the agent repo from the target service repo through `GITHUB_TARGET_OWNER` and `GITHUB_TARGET_REPO`.
- Can dispatch the target repo Claude workflow through `repository_dispatch`.
- Provides a target repo Claude workflow template in `templates/target-repo/back-to-service-claude.yml`.
- Provides a local setup UI with `npm run ui`.
- Includes an offline assignment-grade agent loop with typed tools, SQLite state, evals, prompt variants, redaction, latency, and estimated cost tracking.

## Main Commands

```bash
npm run validate:config
npm run agent:sync -- --limit 5
npm run agent:sync -- --apply --limit 5
npm run agent:sync -- --apply --limit 5 --redispatch
npm run agent:run
npm run eval
npm run eval -- --ablation
npm run ui
npm run show:claude-workflow
```

## Setup

Create a local `.env` from `.env.example`, or use:

```bash
npm run ui
```

Required provider config:

- Sentry token, org, project, environment, and region URL.
- GitHub App ID, private key, installation ID, agent repo, and target repo.
- Vercel token, project ID, and team ID when applicable.

For the target repo Claude repair workflow:

- Add `.github/workflows/back-to-service-claude.yml` to the target repo using `npm run show:claude-workflow`.
- Add `ANTHROPIC_API_KEY` as a GitHub Actions secret in the target repo.
- Ensure the Back To Service GitHub App has Metadata read, Issues read/write, and Contents read/write on the target repo.

## Scheduled Autopilot

Back To Service can run from GitHub Actions via:

```text
.github/workflows/back-to-service-poll.yml
```

That workflow polls Sentry every 5 minutes, creates target repo issues for new Sentry incidents, and relies on the target repo issue trigger to start Claude immediately.

See `docs/GITHUB_ACTIONS_AUTOPILOT.md` for required GitHub secrets and variables.

## Safety

- `.env` is ignored and should never be committed.
- Secret values are redacted before logs, eval traces, and UI command output.
- Claude opens draft PRs only.
- No auto-merge, deploy, rollback, or production mutation is enabled by default.
- Existing issues are not redispatched every cron run to avoid repeatedly triggering Claude.

