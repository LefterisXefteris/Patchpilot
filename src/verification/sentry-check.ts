import type { AppConfig } from '../config/schema.js';
import type { CheckResult } from './types.js';

export type SentryCheckDependencies = {
  getIssue: (params: {
    authToken: string;
    regionUrl: string;
    issueId: string;
  }) => Promise<{ status: string; count: string; lastSeen: string; isUnhandled?: boolean }>;
};

export async function checkSentryQuieting(
  config: AppConfig,
  sentryIssueId: string,
  deps?: SentryCheckDependencies,
): Promise<CheckResult> {
  const start = Date.now();

  if (!sentryIssueId) {
    return {
      name: 'sentry_check',
      status: 'skipped',
      message: 'No Sentry issue ID provided for verification',
      durationMs: Date.now() - start,
    };
  }

  const fetcher = deps ?? createDefaultDeps();

  try {
    const issue = await fetcher.getIssue({
      authToken: config.sentry.authToken,
      regionUrl: config.sentry.regionUrl,
      issueId: sentryIssueId,
    });

    const isResolved = issue.status === 'resolved';
    const isIgnored = issue.status === 'ignored';
    const lastSeen = new Date(issue.lastSeen);
    const quietMinutes = (Date.now() - lastSeen.getTime()) / 60_000;
    const isQuiet = quietMinutes > 10;

    if (isResolved) {
      return {
        name: 'sentry_check',
        status: 'pass',
        message: `Sentry issue ${sentryIssueId} is resolved`,
        details: { issueId: sentryIssueId, sentryStatus: issue.status, quietMinutes: Math.round(quietMinutes) },
        durationMs: Date.now() - start,
      };
    }

    if (isIgnored) {
      return {
        name: 'sentry_check',
        status: 'degraded',
        message: `Sentry issue ${sentryIssueId} is ignored (not truly resolved)`,
        details: { issueId: sentryIssueId, sentryStatus: issue.status },
        durationMs: Date.now() - start,
      };
    }

    if (isQuiet) {
      return {
        name: 'sentry_check',
        status: 'pass',
        message: `Sentry issue ${sentryIssueId} quiet for ${Math.round(quietMinutes)} minutes`,
        details: { issueId: sentryIssueId, sentryStatus: issue.status, quietMinutes: Math.round(quietMinutes) },
        durationMs: Date.now() - start,
      };
    }

    return {
      name: 'sentry_check',
      status: 'fail',
      message: `Sentry issue ${sentryIssueId} still active (last seen ${Math.round(quietMinutes)}m ago)`,
      details: {
        issueId: sentryIssueId,
        sentryStatus: issue.status,
        quietMinutes: Math.round(quietMinutes),
        eventCount: issue.count,
      },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'sentry_check',
      status: 'fail',
      message: `Sentry check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { issueId: sentryIssueId },
      durationMs: Date.now() - start,
    };
  }
}

function createDefaultDeps(): SentryCheckDependencies {
  return {
    getIssue: async ({ authToken, regionUrl, issueId }) => {
      const url = new URL(`/api/0/issues/${issueId}/`, regionUrl);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {
        throw new Error(`Sentry API ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        status: String(data.status ?? 'unresolved'),
        count: String(data.count ?? '0'),
        lastSeen: String(data.lastSeen ?? new Date().toISOString()),
        isUnhandled: Boolean(data.isUnhandled),
      };
    },
  };
}
