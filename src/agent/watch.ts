import { selectWatchableGitHubIssues, type WatchedGitHubIssue } from './github-issue-watcher.js';
import { assertTargetRepositoryConfigured, buildRepairDispatchComment, repairDispatchEvent } from './sync.js';
import type { AppConfig } from '../config/schema.js';
import { isActionAllowed } from '../policy/autopilot-policy.js';
import { GitHubIssueSyncClient } from '../providers/github/issues.js';
import type { SentryIssueSummary } from '../providers/sentry/issues.js';

export type AgentWatchOptions = {
  apply?: boolean;
  limit?: number;
};

export type AgentWatchIssueResult = {
  githubIssueNumber: number;
  githubIssueUrl?: string;
  sentryIssueId?: string;
  shortId?: string;
  action: 'would_accept' | 'accepted' | 'ignored' | 'blocked';
  claudeDispatch?: 'would_dispatch' | 'dispatched' | 'blocked' | 'skipped';
  reason: string;
};

export type AgentWatchSummary = {
  ok: boolean;
  dryRun: boolean;
  githubIssueCount: number;
  acceptedCount: number;
  results: AgentWatchIssueResult[];
};

type GitHubWatchPort = Pick<GitHubIssueSyncClient, 'listOpenIssues' | 'addIssueComment' | 'createRepositoryDispatch'>;

export type AgentWatchDependencies = {
  github?: GitHubWatchPort;
};

export async function runAgentWatch(
  config: AppConfig,
  options: AgentWatchOptions = {},
  deps: AgentWatchDependencies = {},
): Promise<AgentWatchSummary> {
  assertTargetRepositoryConfigured(config);

  const dryRun = !options.apply;
  const github = deps.github ?? new GitHubIssueSyncClient(config.github);
  const openIssues = (await github.listOpenIssues()).slice(0, options.limit ?? 25);
  const decisions = selectWatchableGitHubIssues(openIssues);
  const results: AgentWatchIssueResult[] = [];

  for (const decision of decisions) {
    if (!decision.accepted) {
      results.push({
        githubIssueNumber: decision.issue.number,
        githubIssueUrl: decision.issue.htmlUrl,
        action: 'ignored',
        reason: decision.reason,
      });
      continue;
    }

    results.push(await acceptWatchedIssue(config, github, decision.issue, decision.reason, dryRun));
  }

  return {
    ok: results.every((result) => result.action !== 'blocked'),
    dryRun,
    githubIssueCount: openIssues.length,
    acceptedCount: results.filter((result) => result.action === 'would_accept' || result.action === 'accepted').length,
    results,
  };
}

async function acceptWatchedIssue(
  config: AppConfig,
  github: GitHubWatchPort,
  issue: WatchedGitHubIssue,
  reason: string,
  dryRun: boolean,
): Promise<AgentWatchIssueResult> {
  const base = {
    githubIssueNumber: issue.number,
    githubIssueUrl: issue.htmlUrl,
    sentryIssueId: issue.sentry.issueId,
    shortId: issue.sentry.shortId,
    reason,
  };

  if (dryRun) {
    return { ...base, action: 'would_accept', claudeDispatch: 'would_dispatch' };
  }

  if (!isActionAllowed(config.autopilot, 'update_issue')) {
    return { ...base, action: 'blocked', claudeDispatch: 'skipped', reason: 'Autopilot policy blocked update_issue' };
  }

  await github.addIssueComment(issue.number, buildAcceptedComment(issue));

  if (!isActionAllowed(config.autopilot, 'trigger_claude') && !isActionAllowed(config.autopilot, 'trigger_agent')) {
    return { ...base, action: 'accepted', claudeDispatch: 'blocked', reason: 'Policy accepted the issue but blocked repair dispatch' };
  }

  const sentryIssue = sentrySummaryFromWatchedIssue(issue);
  await github.createRepositoryDispatch(repairDispatchEvent(config), {
    sentryIssueId: issue.sentry.issueId,
    shortId: issue.sentry.shortId ?? issue.sentry.issueId,
    issueNumber: issue.number,
    issueUrl: issue.htmlUrl,
    title: issue.title,
    repairProvider: config.repair.provider,
  });
  await github.addIssueComment(issue.number, buildRepairDispatchComment(sentryIssue, config));

  return { ...base, action: 'accepted', claudeDispatch: 'dispatched' };
}

function buildAcceptedComment(issue: WatchedGitHubIssue): string {
  return [
    '## Back To Service Status',
    '',
    'Accepted this Sentry-created GitHub issue for diagnosis.',
    '',
    `Sentry issue: ${issue.sentry.shortId ?? issue.sentry.issueId}`,
    `Environment: ${issue.environment}`,
    '- Intake: existing GitHub issue accepted',
    '- Diagnosis: queued',
    '- Patch: draft PR only',
  ].join('\n');
}

function sentrySummaryFromWatchedIssue(issue: WatchedGitHubIssue): SentryIssueSummary {
  return {
    id: issue.sentry.issueId,
    shortId: issue.sentry.shortId ?? issue.sentry.issueId,
    title: issue.title,
    status: 'unresolved',
    level: 'error',
    count: 'unknown',
    userCount: 0,
    permalink: issue.sentry.permalink,
  };
}
