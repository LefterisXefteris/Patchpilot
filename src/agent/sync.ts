import type { AppConfig } from '../config/schema.js';
import { isActionAllowed } from '../policy/autopilot-policy.js';
import { GitHubIssueSyncClient } from '../providers/github/issues.js';
import { SentryIssuesClient, type SentryIssueSummary } from '../providers/sentry/issues.js';
import { verifyRecovery } from '../verification/verify-recovery.js';
import type { VerificationResult } from '../verification/types.js';

export type AgentSyncOptions = {
  apply?: boolean;
  limit?: number;
  redispatch?: boolean;
};

export type AgentSyncIssueResult = {
  sentryIssueId: string;
  shortId: string;
  title: string;
  marker: string;
  action: 'would_create_issue' | 'would_update_issue' | 'created_issue' | 'updated_issue' | 'blocked';
  claudeDispatch?: 'would_dispatch' | 'dispatched' | 'skipped' | 'blocked';
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  reason?: string;
};

export type AgentSyncSummary = {
  ok: boolean;
  dryRun: boolean;
  sentryIssueCount: number;
  results: AgentSyncIssueResult[];
  verification?: VerificationResult;
};

type SentryIssuesPort = Pick<SentryIssuesClient, 'listUnresolvedProductionIssues'>;
type GitHubIssuesPort = Pick<GitHubIssueSyncClient, 'findIssueByMarker' | 'createIssue' | 'addIssueComment' | 'createRepositoryDispatch'>;

export type AgentSyncDependencies = {
  sentry?: SentryIssuesPort;
  github?: GitHubIssuesPort;
};

export async function runAgentSync(
  config: AppConfig,
  options: AgentSyncOptions = {},
  deps: AgentSyncDependencies = {},
): Promise<AgentSyncSummary> {
  assertTargetRepositoryConfigured(config);

  const sentry = deps.sentry ?? new SentryIssuesClient(config.sentry);
  const github = deps.github ?? new GitHubIssueSyncClient(config.github);
  const dryRun = !options.apply;
  const issues = await sentry.listUnresolvedProductionIssues(options.limit ?? 10);
  const results: AgentSyncIssueResult[] = [];

  for (const issue of issues) {
    const marker = sentryIssueMarker(issue.id);
    const existing = await github.findIssueByMarker(marker);

    if (existing) {
      results.push(await syncExistingIssue(config, github, issue, marker, existing, dryRun, Boolean(options.redispatch)));
      continue;
    }

    results.push(await syncNewIssue(config, github, issue, marker, dryRun));
  }

  let verification: VerificationResult | undefined;
  if (!dryRun && config.target.productionUrl && issues.length > 0) {
    const firstIssueId = issues[0]?.id ? String(issues[0].id) : undefined;
    verification = await verifyRecovery({ config, sentryIssueId: firstIssueId });
  }

  return {
    ok: results.every((result) => result.action !== 'blocked'),
    dryRun,
    sentryIssueCount: issues.length,
    results,
    verification,
  };
}

export function sentryIssueMarker(issueId: string): string {
  return `<!-- back-to-service:sentry-issue-id:${issueId} -->`;
}

export function assertTargetRepositoryConfigured(config: AppConfig): void {
  if (config.github.targetOwner && config.github.targetRepo) {
    return;
  }

  throw new Error(
    'GITHUB_TARGET_OWNER and GITHUB_TARGET_REPO are required for agent:sync. ' +
      'They must point at the broken service repository, not the Back To Service agent repository.',
  );
}

export function buildIssueTitle(issue: SentryIssueSummary): string {
  return `[Sentry ${issue.shortId}] ${issue.title}`;
}

export function buildIssueBody(issue: SentryIssueSummary, marker = sentryIssueMarker(issue.id)): string {
  return [
    marker,
    '',
    '## Production Error',
    '',
    `**Sentry issue:** ${issue.shortId}`,
    `**Status:** ${issue.status ?? 'unknown'}`,
    `**Level:** ${issue.level ?? 'unknown'}`,
    `**Users affected:** ${issue.userCount ?? 0}`,
    `**Events:** ${issue.count ?? 'unknown'}`,
    `**First seen:** ${issue.firstSeen ?? 'unknown'}`,
    `**Last seen:** ${issue.lastSeen ?? 'unknown'}`,
    '',
    `**Culprit:** ${issue.culprit ?? 'unknown'}`,
    issue.permalink ? `**Sentry link:** ${issue.permalink}` : undefined,
    '',
    '## Agent Status',
    '',
    '- Intake: detected',
    '- Diagnosis: pending',
    '- Patch: pending',
    '- Recovery: pending',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export function buildIssueComment(issue: SentryIssueSummary): string {
  return [
    '## Back To Service Update',
    '',
    `Sentry issue ${issue.shortId} is still unresolved in production.`,
    `Last seen: ${issue.lastSeen ?? 'unknown'}`,
    `Events: ${issue.count ?? 'unknown'}`,
    `Users affected: ${issue.userCount ?? 0}`,
  ].join('\n');
}

function baseResult(issue: SentryIssueSummary, marker: string) {
  return {
    sentryIssueId: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    marker,
  };
}

async function syncExistingIssue(
  config: AppConfig,
  github: GitHubIssuesPort,
  issue: SentryIssueSummary,
  marker: string,
  existing: { number: number; htmlUrl?: string },
  dryRun: boolean,
  redispatch: boolean,
): Promise<AgentSyncIssueResult> {
  if (dryRun) {
    return {
      ...baseResult(issue, marker),
      action: 'would_update_issue',
      claudeDispatch: redispatch ? 'would_dispatch' : 'skipped',
      githubIssueNumber: existing.number,
      githubIssueUrl: existing.htmlUrl,
    };
  }

  if (!isActionAllowed(config.autopilot, 'update_issue')) {
    return {
      ...baseResult(issue, marker),
      action: 'blocked',
      claudeDispatch: 'skipped',
      githubIssueNumber: existing.number,
      githubIssueUrl: existing.htmlUrl,
      reason: 'Autopilot policy blocked update_issue',
    };
  }

  await github.addIssueComment(existing.number, buildIssueComment(issue));

  const claudeDispatch = redispatch
    ? await maybeDispatchClaude(config, github, issue, existing.number, existing.htmlUrl, dryRun)
    : 'skipped';

  return {
    ...baseResult(issue, marker),
    action: 'updated_issue',
    claudeDispatch,
    githubIssueNumber: existing.number,
    githubIssueUrl: existing.htmlUrl,
  };
}

async function syncNewIssue(
  config: AppConfig,
  github: GitHubIssuesPort,
  issue: SentryIssueSummary,
  marker: string,
  dryRun: boolean,
): Promise<AgentSyncIssueResult> {
  if (dryRun) {
    return {
      ...baseResult(issue, marker),
      action: 'would_create_issue',
      claudeDispatch: 'would_dispatch',
    };
  }

  if (!isActionAllowed(config.autopilot, 'create_issue')) {
    return {
      ...baseResult(issue, marker),
      action: 'blocked',
      claudeDispatch: 'skipped',
      reason: 'Autopilot policy blocked create_issue',
    };
  }

  const created = await github.createIssue({
    title: buildIssueTitle(issue),
    body: buildIssueBody(issue, marker),
  });

  return {
    ...baseResult(issue, marker),
    action: 'created_issue',
    claudeDispatch: await maybeDispatchClaude(config, github, issue, created.number, created.htmlUrl, dryRun),
    githubIssueNumber: created.number,
    githubIssueUrl: created.htmlUrl,
  };
}

async function maybeDispatchClaude(
  config: AppConfig,
  github: GitHubIssuesPort,
  issue: SentryIssueSummary,
  githubIssueNumber: number,
  githubIssueUrl: string | undefined,
  dryRun: boolean,
): Promise<NonNullable<AgentSyncIssueResult['claudeDispatch']>> {
  if (dryRun) {
    return 'would_dispatch';
  }

  if (!isActionAllowed(config.autopilot, 'trigger_claude') && !isActionAllowed(config.autopilot, 'trigger_agent')) {
    return 'blocked';
  }

  await github.createRepositoryDispatch('back-to-service.incident', {
    sentryIssueId: issue.id,
    shortId: issue.shortId,
    issueNumber: githubIssueNumber,
    issueUrl: githubIssueUrl,
    title: issue.title,
    marker: sentryIssueMarker(issue.id),
  });

  return 'dispatched';
}
