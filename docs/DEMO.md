# Demo Flow

This demo is the fastest way to understand Patchpilot as a product: Sentry sees production pain, Patchpilot turns it into GitHub work, and humans review the final code change.

## Crash Recovery

1. A production error appears in Sentry.
2. Sentry's GitHub integration creates an issue in the target repository.
3. Patchpilot accepts the issue when it has production Sentry evidence.
4. Patchpilot comments with status and dispatches the configured repair worker.
5. Claude Code or OpenAI Codex investigates the target repo and opens a draft PR.
6. After the fix reaches production, Patchpilot checks Vercel, HTTP health, and Sentry quieting.
7. Patchpilot closes, waits, retries, or escalates the incident issue with an auditable comment.

```text
Sentry error
-> GitHub incident issue
-> Patchpilot intake
-> Repair worker
-> Draft PR
-> Vercel deploy
-> Recovery verification
-> Close / wait / retry / escalate
```

## Performance Bottleneck Recovery

1. Patchpilot queries Sentry production spans and transactions.
2. Slow or regressed bottlenecks are filtered by sample count, p95 threshold, allowed span ops, and regression ratio.
3. Patchpilot creates or updates a GitHub performance incident issue.
4. The repair worker receives p75/p95/p99, baseline/current comparison, release, transaction, and span context.
5. The worker opens an optimization PR.
6. Humans review before merge by default.
7. Patchpilot can verify improvement against the original threshold or baseline.

```text
Sentry spans / transactions
-> Slow or regressed bottleneck
-> GitHub performance issue
-> Optimization PR
-> Human review
-> Performance verification
```

## What To Look For

- GitHub issue comments form the incident timeline.
- Draft PRs contain the proposed code change and verification output.
- Policy prevents merge, rollback, deploy, or recovery hooks unless explicitly allowed.
- Redaction prevents secrets and sensitive payload data from becoming public audit artifacts.
