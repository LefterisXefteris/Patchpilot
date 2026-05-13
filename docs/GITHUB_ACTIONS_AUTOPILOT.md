# GitHub Actions Autopilot

Patchpilot can run from GitHub Actions so it does not depend on a laptop.

## Flow

```text
GitHub schedule every 5 minutes
-> Sentry GitHub integration has already created GitHub issues in the target repo
-> Patchpilot watches eligible Sentry-created issues
-> Target repo repair workflow starts Claude or Codex
-> Repair worker opens a draft PR
```

GitHub Actions scheduled workflows are not a good fit for 2 minute polling. The workflow uses 5 minutes as a safety net around Sentry-created GitHub issues; immediate repair can still happen through the target repo `issues.opened` trigger.

## Patchpilot Repo Setup

Add the workflow:

```text
.github/workflows/back-to-service-poll.yml
```

Add these repository secrets in the Patchpilot repo:

```text
SENTRY_AUTH_TOKEN
BTS_GITHUB_APP_ID
BTS_GITHUB_APP_PRIVATE_KEY
BTS_GITHUB_INSTALLATION_ID
BTS_GITHUB_TARGET_INSTALLATION_ID
VERCEL_TOKEN
```

Add these repository variables in the Patchpilot repo:

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
```

For your current setup, the target values are:

```text
BTS_GITHUB_OWNER=LefterisXefteris
BTS_GITHUB_REPO=backToService
BTS_GITHUB_TARGET_OWNER=LefterisXefteris
BTS_GITHUB_TARGET_REPO=snapsyncai
SENTRY_ORG_SLUG=tribeagent
SENTRY_PROJECT_SLUG=node-express
SENTRY_ENVIRONMENT=production
```

## Target Repo Setup

In the target repo, add one repair workflow. For Claude, add:

```text
.github/workflows/back-to-service-claude.yml
```

Use:

```bash
npm run show:claude-workflow
```

For OpenAI Codex, add:

```text
.github/workflows/back-to-service-codex.yml
```

Use:

```bash
npm run show:codex-workflow
```

Then set this in the Patchpilot repo environment:

```text
BTS_REPAIR_PROVIDER=codex
```

Add the matching target repo GitHub Actions secret:

```text
ANTHROPIC_API_KEY
OPENAI_API_KEY
```

Use `ANTHROPIC_API_KEY` for Claude or `OPENAI_API_KEY` for Codex.

## Existing Issues

The schedule should avoid repeatedly dispatching the same existing issue because that would spam Claude. Patchpilot records accepted issues and uses GitHub issue comments as the visible audit trail.

For a one-off retry, run the Patchpilot workflow manually with:

```text
redispatch=true
```
