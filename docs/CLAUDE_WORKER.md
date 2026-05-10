# Claude Draft PR Worker

Back To Service triggers code repair through a target-repo GitHub Actions workflow.

The preferred v1 path is issue-first:

```text
Sentry -> Back To Service -> GitHub issue in target repo -> Claude workflow opens draft PR
```

The workflow also supports `repository_dispatch` as an explicit backup trigger. For existing issues, comment `/back-to-service fix` on a Back To Service Sentry-marker issue to trigger Claude manually.

## Target Repo Setup

Create this file in the broken app repository:

```text
.github/workflows/back-to-service-claude.yml
```

Use the template from:

```text
templates/target-repo/back-to-service-claude.yml
```

Then add this GitHub Actions repository secret in the target repo:

```text
ANTHROPIC_API_KEY
```

The secret must point to an Anthropic account with enough credits for Claude Code runs. If the workflow starts but fails with a low-credit Anthropic error, Back To Service intake is working; replenish credits or rotate the secret, then use a manual redispatch or comment `/back-to-service fix` on the incident issue.

The Back To Service GitHub App must be installed on the target repo with:

```text
Metadata: read
Issues: read/write
Contents: read/write
```

The target workflow also needs these `GITHUB_TOKEN` permissions:

```text
contents: write
pull-requests: write
issues: write
id-token: write
```

For the assignment/demo workflow, the template passes the repository `GITHUB_TOKEN` into Claude Code so the target repo can create a draft PR without a separate Claude GitHub App setup. For a harder production deployment, install the official Claude GitHub App or use a dedicated custom GitHub App token.

The template also grants Claude a narrow set of repository tools for the repair loop: file read/write/edit plus `rg`, `grep`, `find`, `npm`, and read-only `git status`/`git diff`.

When Back To Service dispatches with suspect files from Sentry stack frames or SQLite memory, Claude should inspect those files first. Broad repo search is a fallback when the suspect files do not explain the incident.

## Live Trigger

After the target repo workflow and secret exist:

```bash
export AUTOPILOT_ENABLED=true
export AUTOPILOT_DRY_RUN=false
export AUTOPILOT_ALLOWED_ACTIONS=create_issue,update_issue,trigger_claude

npm run agent:run -- --live --apply
```

The normal expected result is:

```text
Back To Service creates a GitHub issue -> GitHub Actions starts immediately -> Claude opens a draft PR
```

Default unattended behavior dispatches Claude for new production Sentry incidents only. Existing incidents are updated without redispatch during normal polling; `agent:recover` handles retries when verification still sees production failing and the retry budget allows it.

The backup trigger is a `repository_dispatch` event named:

```text
back-to-service.incident
```

Claude should then open a draft PR in the target repo. It must not merge, deploy, rollback, or expose secrets.

## Notes

- The workflow only runs for GitHub issues that contain the Back To Service hidden marker:

```text
<!-- back-to-service:sentry-issue-id:
```

- Existing issues can be retried with this comment:

```text
/back-to-service fix
```

- GitHub does not start new workflow runs for most events created with a workflow `GITHUB_TOKEN`, but Back To Service uses a GitHub App installation token. GitHub documents GitHub App installation tokens as the correct way to trigger events from automation when needed.
