import { describe, expect, it, vi } from 'vitest';

import { sentryIssueMarker } from '../src/agent/sync.js';
import { runAgentWatch } from '../src/agent/watch.js';
import { loadConfigFromEnv } from '../src/config/env.js';
import { validEnv } from './test-helpers.js';

describe('runAgentWatch', () => {
  it('dry-runs eligible Sentry-created GitHub issues without mutating GitHub', async () => {
    const addIssueComment = vi.fn();
    const createRepositoryDispatch = vi.fn();
    const summary = await runAgentWatch(
      await loadConfigFromEnv(validEnv),
      { limit: 10 },
      {
        github: {
          listOpenIssues: async () => [
            {
              number: 12,
              title: '[Sentry NODE-12] Production crash',
              body: `${sentryIssueMarker('123')}\nEnvironment: production`,
              labels: ['sentry', 'production'],
              htmlUrl: 'https://github.example/issues/12',
            },
          ],
          addIssueComment,
          createRepositoryDispatch,
        },
      },
    );

    expect(summary.ok).toBe(true);
    expect(summary.dryRun).toBe(true);
    expect(summary.acceptedCount).toBe(1);
    expect(summary.results[0]?.action).toBe('would_accept');
    expect(addIssueComment).not.toHaveBeenCalled();
    expect(createRepositoryDispatch).not.toHaveBeenCalled();
  });

  it('ignores issues without Sentry evidence', async () => {
    const summary = await runAgentWatch(
      await loadConfigFromEnv(validEnv),
      {},
      {
        github: {
          listOpenIssues: async () => [{ number: 13, title: 'Plain bug', body: 'Needs a look', labels: ['bug'] }],
          addIssueComment: vi.fn(),
          createRepositoryDispatch: vi.fn(),
        },
      },
    );

    expect(summary.acceptedCount).toBe(0);
    expect(summary.results[0]?.action).toBe('ignored');
  });

  it('dispatches Claude for accepted issues when apply and policy allow it', async () => {
    const addIssueComment = vi.fn();
    const createRepositoryDispatch = vi.fn();
    const summary = await runAgentWatch(
      await loadConfigFromEnv(validEnv),
      { apply: true },
      {
        github: {
          listOpenIssues: async () => [
            {
              number: 14,
              title: '[Sentry NODE-14] Production crash',
              body: `${sentryIssueMarker('456')}\nEnvironment: production`,
              labels: ['sentry', 'production'],
              htmlUrl: 'https://github.example/issues/14',
            },
          ],
          addIssueComment,
          createRepositoryDispatch,
        },
      },
    );

    expect(summary.results[0]?.action).toBe('accepted');
    expect(summary.results[0]?.claudeDispatch).toBe('dispatched');
    expect(addIssueComment).toHaveBeenCalledWith(14, expect.stringContaining('Accepted this Sentry-created GitHub issue'));
    expect(createRepositoryDispatch).toHaveBeenCalledWith('back-to-service.incident', expect.objectContaining({ issueNumber: 14 }));
  });
});
