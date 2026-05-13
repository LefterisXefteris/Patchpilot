import { describe, expect, it, vi } from 'vitest';

import { loadConfigFromEnv } from '../src/config/env.js';
import { buildIssueBody, runAgentSync, sentryIssueMarker } from '../src/agent/sync.js';
import type { ProductImpactSummary } from '../src/providers/posthog/impact.js';
import type { SentryIssueSummary } from '../src/providers/sentry/issues.js';
import { validEnv } from './test-helpers.js';

const issue: SentryIssueSummary = {
  id: '123',
  shortId: 'NODE-1',
  title: 'TypeError: Cannot read properties of undefined',
  status: 'unresolved',
  level: 'error',
  count: '4',
  userCount: 2,
  culprit: 'src/index.ts',
  permalink: 'https://sentry.example/issues/123',
  firstSeen: '2026-05-06T10:00:00Z',
  lastSeen: '2026-05-06T10:05:00Z',
};

const productImpact: ProductImpactSummary = {
  provider: 'posthog',
  windowStart: '2026-05-05T10:00:00.000Z',
  windowEnd: '2026-05-06T10:00:00.000Z',
  baselineStart: '2026-05-04T10:00:00.000Z',
  baselineEnd: '2026-05-05T10:00:00.000Z',
  totalCurrentCount: 4,
  totalBaselineCount: 10,
  totalCurrentActors: 4,
  totalBaselineActors: 9,
  totalDeltaCount: -6,
  totalDeltaPercent: -60,
  summary: '4 configured impact events observed, down 60% versus baseline.',
  impactEvents: [
    {
      event: 'checkout_completed',
      currentCount: 4,
      currentActors: 4,
      baselineCount: 10,
      baselineActors: 9,
      deltaCount: -6,
      deltaPercent: -60,
    },
  ],
};

describe('runAgentSync', () => {
  it('dry-runs creation for unmatched Sentry issues', async () => {
    const createIssue = vi.fn();
    const summary = await runAgentSync(
      await loadConfigFromEnv(validEnv),
      { limit: 1 },
      {
        sentry: { listUnresolvedProductionIssues: async () => [issue] },
        github: {
          findIssueByMarker: async () => undefined,
          createIssue,
          addIssueComment: vi.fn(),
          createRepositoryDispatch: vi.fn(),
        },
      },
    );

    expect(summary.ok).toBe(true);
    expect(summary.dryRun).toBe(true);
    expect(summary.results[0]?.action).toBe('would_create_issue');
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('dry-runs updates for matched GitHub issues', async () => {
    const addIssueComment = vi.fn();
    const createRepositoryDispatch = vi.fn();
    const summary = await runAgentSync(
      await loadConfigFromEnv(validEnv),
      {},
      {
        sentry: { listUnresolvedProductionIssues: async () => [issue] },
        github: {
          findIssueByMarker: async () => ({ number: 7, title: 'Existing', body: sentryIssueMarker(issue.id) }),
          createIssue: vi.fn(),
          addIssueComment,
          createRepositoryDispatch,
        },
        productImpact: { summarizeProductImpact: async () => productImpact },
      },
    );

    expect(summary.results[0]?.action).toBe('would_update_issue');
    expect(summary.results[0]?.claudeDispatch).toBe('skipped');
    expect(summary.results[0]?.githubIssueNumber).toBe(7);
    expect(addIssueComment).not.toHaveBeenCalled();
    expect(createRepositoryDispatch).not.toHaveBeenCalled();
  });

  it('dispatches Claude after creating a new GitHub issue when policy allows it', async () => {
    const createRepositoryDispatch = vi.fn();
    const addIssueComment = vi.fn();
    const summary = await runAgentSync(
      await loadConfigFromEnv(validEnv),
      { apply: true },
      {
        sentry: { listUnresolvedProductionIssues: async () => [issue] },
        github: {
          findIssueByMarker: async () => undefined,
          createIssue: async () => ({ number: 9, title: 'Created', htmlUrl: 'https://github.example/issues/9' }),
          addIssueComment,
          createRepositoryDispatch,
        },
        productImpact: { summarizeProductImpact: async () => productImpact },
      },
    );

    expect(summary.results[0]?.action).toBe('created_issue');
    expect(summary.results[0]?.claudeDispatch).toBe('dispatched');
    expect(createRepositoryDispatch).toHaveBeenCalledWith('back-to-service.incident', expect.objectContaining({
      sentryIssueId: '123',
      shortId: 'NODE-1',
      issueNumber: 9,
      productImpact: expect.objectContaining({ provider: 'posthog', totalDeltaPercent: -60 }),
    }));
    expect(addIssueComment).toHaveBeenCalledWith(9, expect.stringContaining('Claude Code was dispatched'));
    expect(addIssueComment).toHaveBeenCalledWith(9, expect.stringContaining('Blocked: merge, deploy, rollback'));
  });

  it('does not redispatch Claude for existing issues during normal apply sync', async () => {
    const createRepositoryDispatch = vi.fn();
    const addIssueComment = vi.fn();
    const summary = await runAgentSync(
      await loadConfigFromEnv(validEnv),
      { apply: true },
      {
        sentry: { listUnresolvedProductionIssues: async () => [issue] },
        github: {
          findIssueByMarker: async () => ({ number: 7, title: 'Existing', body: sentryIssueMarker(issue.id) }),
          createIssue: vi.fn(),
          addIssueComment,
          createRepositoryDispatch,
        },
        productImpact: { summarizeProductImpact: async () => productImpact },
      },
    );

    expect(summary.results[0]?.action).toBe('updated_issue');
    expect(summary.results[0]?.claudeDispatch).toBe('skipped');
    expect(addIssueComment).toHaveBeenCalledOnce();
    expect(addIssueComment).toHaveBeenCalledWith(7, expect.stringContaining('still unresolved in production'));
    expect(addIssueComment).toHaveBeenCalledWith(7, expect.stringContaining('## Product Impact'));
    expect(createRepositoryDispatch).not.toHaveBeenCalled();
  });

  it('redispatches Claude for existing issues only when requested', async () => {
    const createRepositoryDispatch = vi.fn();
    const summary = await runAgentSync(
      await loadConfigFromEnv(validEnv),
      { apply: true, redispatch: true },
      {
        sentry: { listUnresolvedProductionIssues: async () => [issue] },
        github: {
          findIssueByMarker: async () => ({ number: 7, title: 'Existing', body: sentryIssueMarker(issue.id) }),
          createIssue: vi.fn(),
          addIssueComment: vi.fn(),
          createRepositoryDispatch,
        },
      },
    );

    expect(summary.results[0]?.action).toBe('updated_issue');
    expect(summary.results[0]?.claudeDispatch).toBe('dispatched');
    expect(createRepositoryDispatch).toHaveBeenCalledOnce();
  });

  it('blocks apply when policy disallows issue mutation', async () => {
    const config = await loadConfigFromEnv({
      ...validEnv,
      AUTOPILOT_DRY_RUN: 'true',
    });

    const summary = await runAgentSync(
      config,
      { apply: true },
      {
        sentry: { listUnresolvedProductionIssues: async () => [issue] },
        github: {
          findIssueByMarker: async () => undefined,
          createIssue: vi.fn(),
          addIssueComment: vi.fn(),
          createRepositoryDispatch: vi.fn(),
        },
      },
    );

    expect(summary.ok).toBe(false);
    expect(summary.results[0]?.action).toBe('blocked');
    expect(summary.results[0]?.reason).toContain('create_issue');
  });

  it('requires an explicit target service repository', async () => {
    const config = await loadConfigFromEnv({
      ...validEnv,
      GITHUB_TARGET_OWNER: '',
      GITHUB_TARGET_REPO: '',
    });

    await expect(
      runAgentSync(config, {}, { sentry: { listUnresolvedProductionIssues: async () => [] } }),
    ).rejects.toThrow('GITHUB_TARGET_OWNER and GITHUB_TARGET_REPO');
  });

  it('builds GitHub issue bodies with the stable marker', () => {
    expect(buildIssueBody(issue)).toContain('<!-- back-to-service:sentry-issue-id:123 -->');
    expect(buildIssueBody(issue)).toContain('## Production Error');
    expect(buildIssueBody(issue, undefined, productImpact)).toContain('## Product Impact');
  });
});
