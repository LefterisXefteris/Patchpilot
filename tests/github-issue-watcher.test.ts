import { describe, expect, it } from 'vitest';

import { parseEnvironment, parseSentryIssueReference, selectWatchableGitHubIssues } from '../src/agent/github-issue-watcher.js';
import { sentryIssueMarker } from '../src/agent/sync.js';

describe('GitHub issue watcher', () => {
  it('parses Sentry markers, short ids, and permalinks from GitHub issues', () => {
    const markerIssue = {
      number: 1,
      title: '[Sentry NODE-1] Crash',
      body: `${sentryIssueMarker('123')}\nhttps://sentry.example/issues/123`,
    };

    expect(parseSentryIssueReference(markerIssue)).toEqual({
      issueId: '123',
      shortId: 'NODE-1',
      permalink: 'https://sentry.example/issues/123',
    });
    expect(parseSentryIssueReference({ number: 2, title: '[Sentry NODE-2] Crash', body: '' })?.issueId).toBe('NODE-2');
  });

  it('accepts production Sentry-created issues and rejects missing evidence', () => {
    const decisions = selectWatchableGitHubIssues([
      {
        number: 3,
        title: '[Sentry NODE-3] Production crash',
        body: `${sentryIssueMarker('prod-3')}\nEnvironment: production`,
        labels: ['sentry', 'production'],
      },
      {
        number: 4,
        title: 'Plain bug report',
        body: 'No Sentry evidence here',
        labels: ['bug'],
      },
    ]);

    expect(decisions[0]?.accepted).toBe(true);
    expect(decisions[1]?.accepted).toBe(false);
  });

  it('blocks non-production issues unless a manual diagnosis label is present', () => {
    const staging = {
      number: 5,
      title: '[Sentry NODE-5] Staging crash',
      body: `${sentryIssueMarker('stage-5')}\nEnvironment: staging`,
      labels: ['sentry', 'staging'],
    };

    expect(parseEnvironment(staging)).toBe('staging');
    expect(selectWatchableGitHubIssues([staging])[0]?.accepted).toBe(false);
    expect(selectWatchableGitHubIssues([{ ...staging, labels: ['sentry', 'staging', 'back-to-service:diagnose'] }])[0]?.accepted).toBe(true);
  });

  it('deduplicates repeated Sentry issue references in one watcher batch', () => {
    const decisions = selectWatchableGitHubIssues([
      {
        number: 6,
        title: '[Sentry NODE-6] Crash',
        body: `${sentryIssueMarker('same-6')}\nEnvironment: production`,
        labels: ['sentry', 'production'],
      },
      {
        number: 7,
        title: '[Sentry NODE-6] Duplicate crash',
        body: `${sentryIssueMarker('same-6')}\nEnvironment: production`,
        labels: ['sentry', 'production'],
      },
    ]);

    expect(decisions[0]?.accepted).toBe(true);
    expect(decisions[1]?.accepted).toBe(false);
    expect(decisions[1]?.reason).toContain('Duplicate');
  });
});
