import { describe, expect, it, vi } from 'vitest';

import {
  performanceFingerprint,
  performanceSeverity,
  sanitizeSpanDescription,
  SentryPerformanceClient,
} from '../src/providers/sentry/performance.js';
import { createTestConfig } from './test-helpers.js';

describe('SentryPerformanceClient', () => {
  it('queries Sentry Explore spans and normalizes bottlenecks', async () => {
    const config = createTestConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '42' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                transaction: 'GET /api/search',
                'span.op': 'db',
                'span.description': "SELECT * FROM users WHERE email = 'person@example.com' AND id = 12345",
                project: 'web',
                release: 'abc123',
                'count()': 50,
                'avg(span.duration)': 700,
                'p75(span.duration)': 900,
                'p95(span.duration)': 1800,
                'p99(span.duration)': 2500,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                transaction: 'GET /api/search',
                'span.op': 'db',
                'span.description': "SELECT * FROM users WHERE email = 'person@example.com' AND id = 12345",
                'p95(span.duration)': 900,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const client = new SentryPerformanceClient(config.sentry, config.performance, fetchMock);
    const bottlenecks = await client.listProductionBottlenecks({ limit: 5, now: new Date('2026-05-13T12:00:00Z') });

    expect(bottlenecks).toHaveLength(1);
    expect(bottlenecks[0]).toMatchObject({
      kind: 'performance',
      transaction: 'GET /api/search',
      spanOp: 'db',
      count: 50,
      p95Ms: 1800,
      baselineP95Ms: 900,
      regressionRatio: 2,
      severity: 'high',
    });
    expect(bottlenecks[0]?.spanDescription).toContain("'?'");
    expect(bottlenecks[0]?.spanDescription).not.toContain('person@example.com');
    expect(bottlenecks[0]?.spanDescription).not.toContain('12345');

    const currentUrl = fetchMock.mock.calls[1]?.[0] as URL;
    expect(currentUrl.pathname).toBe('/api/0/organizations/acme/events/');
    expect(currentUrl.searchParams.get('dataset')).toBe('spans');
    expect(currentUrl.searchParams.getAll('field')).toContain('p95(span.duration)');
    expect(currentUrl.searchParams.get('query')).toContain('span.op:[http.server,db,http.client,navigation]');
  });

  it('filters bottlenecks below sample, threshold, and regression policy', async () => {
    const config = createTestConfig({ performance: { minSampleCount: 10, p95ThresholdMs: 1_000, regressionRatio: 1.5 } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '42' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { transaction: 'low sample', 'span.op': 'db', 'span.description': 'SELECT 1', 'count()': 5, 'p95(span.duration)': 2000 },
              { transaction: 'fast', 'span.op': 'db', 'span.description': 'SELECT 2', 'count()': 50, 'p95(span.duration)': 500 },
              { transaction: 'not regressed', 'span.op': 'db', 'span.description': 'SELECT 3', 'count()': 50, 'p95(span.duration)': 1100 },
              { transaction: 'slow', 'span.op': 'db', 'span.description': 'SELECT 4', 'count()': 50, 'p95(span.duration)': 2000 },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { transaction: 'not regressed', 'span.op': 'db', 'span.description': 'SELECT 3', 'p95(span.duration)': 1000 },
              { transaction: 'slow', 'span.op': 'db', 'span.description': 'SELECT 4', 'p95(span.duration)': 1000 },
            ],
          }),
          { status: 200 },
        ),
      );

    const client = new SentryPerformanceClient(config.sentry, config.performance, fetchMock);
    const bottlenecks = await client.listProductionBottlenecks();

    expect(bottlenecks.map((bottleneck) => bottleneck.transaction)).toEqual(['slow']);
  });
});

describe('performance helpers', () => {
  it('builds stable fingerprints and severity scores', () => {
    expect(performanceFingerprint('production', 'GET /api/users', 'db', 'SELECT ?')).toContain('perf:production:db');
    expect(performanceSeverity({ p95Ms: 2_500, thresholdMs: 1_000, regressionRatio: 1.2, requiredRegressionRatio: 1.5 })).toBe('high');
    expect(performanceSeverity({ p95Ms: 1_300, thresholdMs: 1_000, regressionRatio: 1.5, requiredRegressionRatio: 1.5 })).toBe('medium');
  });

  it('sanitizes likely sensitive span values', () => {
    expect(sanitizeSpanDescription('GET /users/123456?token=abc')).toBe('GET /users/??token=[REDACTED]');
  });
});
