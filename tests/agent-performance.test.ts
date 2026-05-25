import { describe, expect, it, vi } from 'vitest';

import {
  buildPerformanceIssueBody,
  performanceIssueLabels,
  runAgentPerformanceSync,
  sentryPerformanceMarker,
} from '../src/agent/performance-sync.js';
import type { ProductImpactSummary } from '../src/providers/posthog/impact.js';
import type { SentryPerformanceBottleneck } from '../src/providers/sentry/performance.js';
import { loadConfigFromEnv } from '../src/config/env.js';
import { validEnv } from './test-helpers.js';

const bottleneck: SentryPerformanceBottleneck = {
  kind: 'performance',
  id: 'perf:production:db:get-/api-search:select--',
  fingerprint: 'perf:production:db:get-/api-search:select--',
  transaction: 'GET /api/search',
  spanOp: 'db',
  spanDescription: "SELECT * FROM users WHERE email = '?'",
  project: 'web',
  release: 'abc123',
  environment: 'production',
  count: 40,
  avgMs: 700,
  p75Ms: 900,
  p95Ms: 1800,
  p99Ms: 2500,
  baselineP95Ms: 900,
  regressionRatio: 2,
  severity: 'high',
  permalink: 'https://sentry.example/traces/?query=transaction%3Asearch',
};

const productImpact: ProductImpactSummary = {
  provider: 'posthog',
  windowStart: '2026-05-12T12:00:00.000Z',
  windowEnd: '2026-05-13T12:00:00.000Z',
  baselineStart: '2026-05-11T12:00:00.000Z',
  baselineEnd: '2026-05-12T12:00:00.000Z',
  totalCurrentCount: 8,
  totalBaselineCount: 20,
  totalCurrentActors: 7,
  totalBaselineActors: 18,
  totalDeltaCount: -12,
  totalDeltaPercent: -60,
  summary: '8 configured impact events observed, down 60% versus baseline.',
  impactEvents: [
    {
      event: 'signup_completed',
      currentCount: 8,
      currentActors: 7,
      baselineCount: 20,
      baselineActors: 18,
      deltaCount: -12,
      deltaPercent: -60,
    },
  ],
};

describe('runAgentPerformanceSync', () => {
  it('dry-runs new performance issues without mutating GitHub', async () => {
    const createIssue = vi.fn();
    const addIssueLabels = vi.fn();
    const summary = await runAgentPerformanceSync(
      await loadConfigFromEnv(validEnv),
      { limit: 1 },
      {
        sentry: { listProductionBottlenecks: async () => [bottleneck] },
        github: {
          findIssueByMarker: async () => undefined,
          createIssue,
          addIssueComment: vi.fn(),
          addIssueLabels,
          createRepositoryDispatch: vi.fn(),
        },
      },
    );

    expect(summary.ok).toBe(true);
    expect(summary.dryRun).toBe(true);
    expect(summary.bottleneckCount).toBe(1);
    expect(summary.results[0]?.action).toBe('would_create_issue');
    expect(createIssue).not.toHaveBeenCalled();
    expect(addIssueLabels).not.toHaveBeenCalled();
  });

  it('creates labeled GitHub issues and dispatches performance payloads when applied', async () => {
    const createRepositoryDispatch = vi.fn();
    const addIssueComment = vi.fn();
    const addIssueLabels = vi.fn();
    const summary = await runAgentPerformanceSync(
      await loadConfigFromEnv(validEnv),
      { apply: true },
      {
        sentry: { listProductionBottlenecks: async () => [bottleneck] },
        github: {
          findIssueByMarker: async () => undefined,
          createIssue: async () => ({ number: 22, title: 'Created', htmlUrl: 'https://github.example/issues/22' }),
          addIssueComment,
          addIssueLabels,
          createRepositoryDispatch,
        },
        productImpact: { summarizeProductImpact: async () => productImpact },
      },
    );

    expect(summary.results[0]?.action).toBe('created_issue');
    expect(summary.results[0]?.agentDispatch).toBe('dispatched');
    expect(addIssueLabels).toHaveBeenCalledWith(22, ['sentry', 'production', 'back-to-service:performance', 'severity:high']);
    expect(createRepositoryDispatch).toHaveBeenCalledWith(
      'back-to-service.incident',
      expect.objectContaining({
        incidentKind: 'performance',
        sentryPerformanceFingerprint: bottleneck.fingerprint,
        issueNumber: 22,
        productImpact: expect.objectContaining({ provider: 'posthog', totalDeltaPercent: -60 }),
        performance: expect.objectContaining({
          transaction: 'GET /api/search',
          p95Ms: 1800,
          baselineP95Ms: 900,
          regressionRatio: 2,
        }),
      }),
    );
    expect(addIssueComment).toHaveBeenCalledWith(22, expect.stringContaining('optimization PR'));
    expect(addIssueComment).toHaveBeenCalledWith(22, expect.stringContaining('Blocked: merge, deploy, rollback'));
  });

  it('updates existing performance issues without redispatching unless requested', async () => {
    const createRepositoryDispatch = vi.fn();
    const addIssueComment = vi.fn();
    const summary = await runAgentPerformanceSync(
      await loadConfigFromEnv(validEnv),
      { apply: true },
      {
        sentry: { listProductionBottlenecks: async () => [bottleneck] },
        github: {
          findIssueByMarker: async () => ({ number: 8, title: 'Existing', body: sentryPerformanceMarker(bottleneck.fingerprint) }),
          createIssue: vi.fn(),
          addIssueComment,
          addIssueLabels: vi.fn(),
          createRepositoryDispatch,
        },
        productImpact: { summarizeProductImpact: async () => productImpact },
      },
    );

    expect(summary.results[0]?.action).toBe('updated_issue');
    expect(summary.results[0]?.agentDispatch).toBe('skipped');
    expect(addIssueComment).toHaveBeenCalledWith(8, expect.stringContaining('Performance Update'));
    expect(addIssueComment).toHaveBeenCalledWith(8, expect.stringContaining('## Product Impact'));
    expect(createRepositoryDispatch).not.toHaveBeenCalled();
  });

  it('returns no work when performance intake is disabled', async () => {
    const summary = await runAgentPerformanceSync(
      await loadConfigFromEnv({ ...validEnv, PERF_ENABLED: 'false' }),
      {},
      {
        sentry: { listProductionBottlenecks: vi.fn() },
        github: {
          findIssueByMarker: vi.fn(),
          createIssue: vi.fn(),
          addIssueComment: vi.fn(),
          addIssueLabels: vi.fn(),
          createRepositoryDispatch: vi.fn(),
        },
      },
    );

    expect(summary.enabled).toBe(false);
    expect(summary.bottleneckCount).toBe(0);
  });
});

describe('performance issue formatting', () => {
  it('renders stable body and labels', () => {
    const body = buildPerformanceIssueBody(bottleneck);

    expect(body).toContain('<!-- back-to-service:sentry-performance-fingerprint:');
    expect(body).toContain('## Production Performance Bottleneck');
    expect(body).toContain('**Incident kind:** performance');
    expect(body).toContain('**p95:** 1800ms');
    expect(buildPerformanceIssueBody(bottleneck, undefined, productImpact)).toContain('## Product Impact');
    expect(performanceIssueLabels(bottleneck)).toEqual(['sentry', 'production', 'back-to-service:performance', 'severity:high']);
  });
});
