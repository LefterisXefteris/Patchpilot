import type { AppConfig } from '../config/schema.js';
import { isActionAllowed } from '../policy/autopilot-policy.js';
import { GitHubIssueSyncClient } from '../providers/github/issues.js';
import { SqliteStateStore } from '../state/sqlite-store.js';
import { logJson } from '../agentic/observability.js';
import { verifyRecovery, type VerifyRecoveryInput } from '../verification/verify-recovery.js';
import type { VerificationResult } from '../verification/types.js';
import { decide } from './decide.js';
import type { RecoveryAttemptRecord, RecoveryDecision, RecoveryRunResult, RecoveryRunSummary } from './types.js';

const MARKER_PATTERN = /<!--\s*back-to-service:sentry-issue-id:([^\s]+?)\s*-->/;
const CLAUDE_DISPATCH_EVENT = 'back-to-service.incident';

export type RecoveryRunOptions = {
  apply?: boolean;
  limit?: number;
  dbPath?: string;
};

export type RecoveryDependencies = {
  github?: Pick<
    GitHubIssueSyncClient,
    'listIncidentIssues' | 'addIssueComment' | 'addIssueLabels' | 'closeIssue' | 'createRepositoryDispatch'
  >;
  verify?: (input: VerifyRecoveryInput) => Promise<VerificationResult>;
  store?: Pick<SqliteStateStore, 'init' | 'getLatestRecoveryAttempt' | 'recordRecoveryAttempt'>;
  now?: () => Date;
};

export async function runRecoveryLoop(
  config: AppConfig,
  options: RecoveryRunOptions = {},
  deps: RecoveryDependencies = {},
): Promise<RecoveryRunSummary> {
  const apply = Boolean(options.apply);
  const limit = options.limit ?? 10;

  const github = deps.github ?? new GitHubIssueSyncClient(config.github);
  const verify = deps.verify ?? verifyRecovery;
  const store =
    deps.store ??
    (options.dbPath ? new SqliteStateStore(options.dbPath) : undefined);
  store?.init();

  const issues = await github.listIncidentIssues(limit);
  const filtered = issues.filter((issue) => {
    const labels = issue.labels ?? [];
    return !labels.includes(config.recovery.resolvedLabel) && !labels.includes(config.recovery.needsHumanLabel);
  });

  const results: RecoveryRunResult[] = [];

  for (const issue of filtered) {
    const sentryIssueId = parseSentryIssueId(issue.body ?? '');
    const incidentId = sentryIssueId ? `incident_${sentryIssueId}` : `incident_issue_${issue.number}`;

    const verification = await verify({ config, sentryIssueId });
    const prior = store?.getLatestRecoveryAttempt(incidentId);

    if (
      verification.deploymentAgeSeconds !== undefined &&
      verification.deploymentAgeSeconds < config.recovery.minDeployAgeSeconds
    ) {
      results.push({
        incidentId,
        sentryIssueId,
        issueNumber: issue.number,
        issueUrl: issue.htmlUrl,
        verdict: verification.verdict,
        decision: {
          action: 'wait',
          reason: `Latest deployment is ${verification.deploymentAgeSeconds}s old; waiting for propagation.`,
          attemptNumber: prior?.attemptNumber ?? 1,
          partialStreak: prior?.partialStreak ?? 0,
        },
        applied: false,
        reason: 'deploy_too_fresh',
        verification,
      });
      continue;
    }

    const decision = decide({ verification, prior: prior ?? undefined, policy: config.recovery });

    let applied = false;
    let reason: string | undefined;

    if (apply) {
      const result = await applyDecision({
        config,
        github,
        issue,
        sentryIssueId,
        decision,
        verification,
      });
      applied = result.applied;
      reason = result.reason;
    } else {
      reason = 'dry_run';
    }

    const record: RecoveryAttemptRecord = {
      incidentId,
      sentryIssueId,
      attemptNumber: decision.attemptNumber,
      verdict: verification.verdict,
      action: decision.action,
      reason: decision.reason,
      partialStreak: decision.partialStreak,
      verifiedAt: verification.verifiedAt,
    };
    store?.recordRecoveryAttempt(record, verification);

    logJson({
      level: 'info',
      event: 'recovery_attempt',
      incidentId,
      sentryIssueId,
      issueNumber: issue.number,
      verdict: verification.verdict,
      action: decision.action,
      attemptNumber: decision.attemptNumber,
      applied,
    });

    results.push({
      incidentId,
      sentryIssueId,
      issueNumber: issue.number,
      issueUrl: issue.htmlUrl,
      verdict: verification.verdict,
      decision,
      applied,
      reason,
      verification,
    });
  }

  return {
    ok: true,
    apply,
    scanned: filtered.length,
    results,
  };
}

async function applyDecision(input: {
  config: AppConfig;
  github: NonNullable<RecoveryDependencies['github']>;
  issue: { number: number; title: string; htmlUrl?: string };
  sentryIssueId?: string;
  decision: RecoveryDecision;
  verification: VerificationResult;
}): Promise<{ applied: boolean; reason?: string }> {
  const { config, github, issue, sentryIssueId, decision, verification } = input;

  switch (decision.action) {
    case 'close': {
      await github.addIssueComment(issue.number, buildRecoveredComment(decision, verification));
      await github.addIssueLabels(issue.number, [config.recovery.resolvedLabel]);
      await github.closeIssue(issue.number);
      return { applied: true };
    }

    case 'retry': {
      if (
        !isActionAllowed(config.autopilot, 'trigger_claude') &&
        !isActionAllowed(config.autopilot, 'trigger_agent')
      ) {
        return { applied: false, reason: 'policy_blocked_retry' };
      }
      await github.addIssueComment(issue.number, buildRetryComment(decision, verification));
      await github.createRepositoryDispatch(CLAUDE_DISPATCH_EVENT, {
        sentryIssueId: sentryIssueId ?? '',
        shortId: '',
        issueNumber: issue.number,
        issueUrl: issue.htmlUrl ?? '',
        title: issue.title,
        attemptNumber: decision.attemptNumber,
        retry: true,
      });
      return { applied: true };
    }

    case 'wait': {
      return { applied: false, reason: 'wait_for_next_cycle' };
    }

    case 'escalate': {
      await github.addIssueComment(issue.number, buildEscalateComment(decision, verification));
      await github.addIssueLabels(issue.number, [config.recovery.needsHumanLabel]);
      return { applied: true };
    }
  }
}

function buildRecoveredComment(decision: RecoveryDecision, verification: VerificationResult): string {
  return [
    '## ✅ Back To Service — Recovered',
    '',
    decision.reason,
    '',
    '```text',
    verification.summary,
    '```',
    '',
    `Verified at: ${verification.verifiedAt}`,
  ].join('\n');
}

function buildRetryComment(decision: RecoveryDecision, verification: VerificationResult): string {
  return [
    `## 🔁 Back To Service — Retry attempt ${decision.attemptNumber}`,
    '',
    decision.reason,
    '',
    '```text',
    verification.summary,
    '```',
    '',
    'Re-dispatching the Claude repair workflow now.',
  ].join('\n');
}

function buildEscalateComment(decision: RecoveryDecision, verification: VerificationResult): string {
  return [
    '## 🚨 Back To Service — Needs human',
    '',
    decision.reason,
    '',
    '```text',
    verification.summary,
    '```',
    '',
    'Auto-recovery is paused for this incident. A human should review.',
  ].join('\n');
}

export function parseSentryIssueId(body: string): string | undefined {
  const match = MARKER_PATTERN.exec(body);
  return match?.[1];
}
