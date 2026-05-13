import { describe, expect, it } from 'vitest';

import { checkSentryPerformanceRecovery } from '../src/verification/performance-check.js';
import { verifyPerformanceRecovery } from '../src/verification/verify-recovery.js';
import { createTestConfig } from './test-helpers.js';
import type { SentryPerformanceBottleneck } from '../src/providers/sentry/performance.js';
import type { DeployCheckDependencies } from '../src/verification/deploy-check.js';
import type { FetchLike } from '../src/verification/health-check.js';

const baseBottleneck: SentryPerformanceBottleneck = {
  kind: 'performance',
  id: 'perf:production:db:get-/api-search:select--',
  fingerprint: 'perf:production:db:get-/api-search:select--',
  transaction: 'GET /api/search',
  spanOp: 'db',
  spanDescription: 'SELECT ?',
  environment: 'production',
  count: 50,
  avgMs: 600,
  p75Ms: 800,
  p95Ms: 900,
  p99Ms: 1200,
  baselineP95Ms: 1800,
  regressionRatio: 0.5,
  severity: 'low',
};

const readyDeploy: DeployCheckDependencies = {
  listDeployments: async () => ({ deployments: [{ uid: 'dpl_1', state: 'READY', target: 'production' }] }),
};

const healthyFetch: FetchLike = async () => new Response('OK', { status: 200 });

describe('checkSentryPerformanceRecovery', () => {
  it('passes when the bottleneck drops below threshold', async () => {
    const config = createTestConfig({ performance: { p95ThresholdMs: 1_000 } });
    const result = await checkSentryPerformanceRecovery(
      config,
      { fingerprint: baseBottleneck.fingerprint, baselineP95Ms: 1800 },
      { getBottleneck: async () => baseBottleneck },
    );

    expect(result.status).toBe('pass');
    expect(result.message).toContain('Performance improved');
  });

  it('fails when performance remains above threshold and baseline', async () => {
    const config = createTestConfig({ performance: { p95ThresholdMs: 1_000 } });
    const result = await checkSentryPerformanceRecovery(
      config,
      { fingerprint: baseBottleneck.fingerprint, baselineP95Ms: 1800 },
      { getBottleneck: async () => ({ ...baseBottleneck, p95Ms: 2200, baselineP95Ms: 1800 }) },
    );

    expect(result.status).toBe('fail');
    expect(result.message).toContain('still active');
  });

  it('degrades when there are too few samples', async () => {
    const config = createTestConfig({ performance: { minSampleCount: 20, p95ThresholdMs: 1_000 } });
    const result = await checkSentryPerformanceRecovery(
      config,
      { fingerprint: baseBottleneck.fingerprint },
      { getBottleneck: async () => ({ ...baseBottleneck, count: 3, p95Ms: 700 }) },
    );

    expect(result.status).toBe('degraded');
    expect(result.message).toContain('samples');
  });

  it('passes when the bottleneck is no longer found above intake thresholds', async () => {
    const config = createTestConfig();
    const result = await checkSentryPerformanceRecovery(
      config,
      { fingerprint: baseBottleneck.fingerprint },
      { getBottleneck: async () => undefined },
    );

    expect(result.status).toBe('pass');
  });
});

describe('verifyPerformanceRecovery', () => {
  it('combines deploy, health, and Sentry performance checks', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await verifyPerformanceRecovery({
      config,
      performance: { fingerprint: baseBottleneck.fingerprint, baselineP95Ms: 1800 },
      fetchImpl: healthyFetch,
      vercelDeps: readyDeploy,
      performanceDeps: { getBottleneck: async () => baseBottleneck },
    });

    expect(result.verdict).toBe('recovered');
    expect(result.checks.map((check) => check.name)).toEqual([
      'deploy_check',
      'health_check',
      'sentry_performance_check',
    ]);
  });
});
