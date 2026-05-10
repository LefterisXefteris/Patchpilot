import { BACK_TO_SERVICE_MARKER_PREFIX, type GitHubIssueSummary } from '../providers/github/issues.js';

export type SentryIssueReference = {
  issueId: string;
  shortId?: string;
  permalink?: string;
};

export type WatchedGitHubIssue = GitHubIssueSummary & {
  sentry: SentryIssueReference;
  environment: string;
};

export type WatchDecision =
  | { accepted: true; issue: WatchedGitHubIssue; reason: string }
  | { accepted: false; issue: GitHubIssueSummary; reason: string };

const manualApprovalLabels = new Set(['back-to-service', 'back-to-service:diagnose', 'agent:diagnose']);
const sentryLabels = new Set(['sentry', 'sentry-issue', 'production-error']);
const nonProductionLabels = new Set(['staging', 'development', 'dev', 'preview', 'test']);

export function selectWatchableGitHubIssues(issues: GitHubIssueSummary[]): WatchDecision[] {
  const seen = new Set<string>();

  return issues.map((issue) => {
    const reference = parseSentryIssueReference(issue);
    if (!reference) {
      return { accepted: false, issue, reason: 'GitHub issue does not contain a Sentry issue marker, short id, or permalink.' };
    }

    const labels = normalizedLabels(issue);
    const environment = parseEnvironment(issue);
    if (environment !== 'production' && !hasManualApproval(labels)) {
      return { accepted: false, issue, reason: `GitHub issue is marked as ${environment}, not production.` };
    }

    if (!hasSentrySignal(issue, labels) && !hasManualApproval(labels)) {
      return { accepted: false, issue, reason: 'GitHub issue is missing the configured Sentry/manual-diagnosis signal.' };
    }

    const dedupeKey = reference.issueId;
    if (seen.has(dedupeKey)) {
      return { accepted: false, issue, reason: 'Duplicate GitHub issue/Sentry issue pair in this watcher batch.' };
    }
    seen.add(dedupeKey);

    return {
      accepted: true,
      issue: { ...issue, sentry: reference, environment },
      reason: 'GitHub issue has production Sentry evidence and is eligible for diagnosis.',
    };
  });
}

export function parseSentryIssueReference(issue: GitHubIssueSummary): SentryIssueReference | undefined {
  const haystack = `${issue.title}\n${issue.body ?? ''}`;
  const markerMatch = haystack.match(/<!--\s*back-to-service:sentry-issue-id:([^-\s>][^>\s]*)\s*-->/i);
  const permalink = haystack.match(/https?:\/\/[^\s)]+\/issues\/([A-Za-z0-9_-]+)[^\s)]*/i);
  const shortId = haystack.match(/\b([A-Z][A-Z0-9_-]+-\d+)\b/);
  const explicitId = haystack.match(/\bSentry issue(?: ID)?:\s*([A-Za-z0-9_-]+)\b/i);

  const issueId = markerMatch?.[1] ?? explicitId?.[1] ?? permalink?.[1] ?? shortId?.[1];
  if (!issueId) {
    return undefined;
  }

  return {
    issueId,
    shortId: shortId?.[1],
    permalink: permalink?.[0],
  };
}

export function parseEnvironment(issue: GitHubIssueSummary): string {
  const labels = normalizedLabels(issue);
  for (const label of labels) {
    if (nonProductionLabels.has(label)) {
      return label;
    }
    if (label === 'production' || label === 'prod') {
      return 'production';
    }
  }

  const haystack = `${issue.title}\n${issue.body ?? ''}`;
  const match = haystack.match(/\bEnvironment:\s*\*{0,2}([A-Za-z0-9_-]+)\*{0,2}/i);
  return match?.[1]?.toLowerCase() ?? 'production';
}

function hasSentrySignal(issue: GitHubIssueSummary, labels: Set<string>): boolean {
  if ([...labels].some((label) => sentryLabels.has(label))) {
    return true;
  }

  const haystack = `${issue.title}\n${issue.body ?? ''}`;
  return haystack.includes(BACK_TO_SERVICE_MARKER_PREFIX) || /\bsentry\b/i.test(haystack);
}

function hasManualApproval(labels: Set<string>): boolean {
  return [...labels].some((label) => manualApprovalLabels.has(label));
}

function normalizedLabels(issue: GitHubIssueSummary): Set<string> {
  return new Set((issue.labels ?? []).map((label) => label.trim().toLowerCase()).filter(Boolean));
}
