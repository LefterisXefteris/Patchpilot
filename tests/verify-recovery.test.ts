import { describe, it, expect } from 'vitest';
import { verifyRecovery } from '../src/verification/verify-recovery.js';
import { createTestConfig } from './test-helpers.js';
import type { DeployCheckDependencies } from '../src/verification/deploy-check.js';
import type { SentryCheckDependencies } from '../src/verification/sentry-check.js';
import type { FetchLike } from '../src/verification/health-check.js';

const readyDeploy: DeployCheckDependencies = {
  listDeployments: async () => ({
    deployments: [{ uid: 'dpl_1', state: 'READY', target: 'production' }],
  }),
};

const errorDeploy: DeployCheckDependencies = {
  listDeployments: async () => ({
    deployments: [{ uid: 'dpl_1', state: 'ERROR', target: 'production' }],
  }),
};

const resolvedSentry: SentryCheckDependencies = {
  getIssue: async () => ({
    status: 'resolved',
    count: '10',
    lastSeen: new Date(Date.now() - 30 * 60_000).toISOString(),
  }),
};

const activeSentry: SentryCheckDependencies = {
  getIssue: async () => ({
    status: 'unresolved',
    count: '50',
    lastSeen: new Date(Date.now() - 60_000).toISOString(),
  }),
};

const healthyFetch: FetchLike = async () => new Response('OK', { status: 200 });
const unhealthyFetch: FetchLike = async () => new Response('', { status: 500 });

describe('verifyRecovery', () => {
  it('returns recovered when all checks pass', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await verifyRecovery({
      config,
      sentryIssueId: 'issue-1',
      fetchImpl: healthyFetch,
      vercelDeps: readyDeploy,
      sentryDeps: resolvedSentry,
    });
    expect(result.verdict).toBe('recovered');
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('returns still_failing when all checks fail', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await verifyRecovery({
      config,
      sentryIssueId: 'issue-1',
      fetchImpl: unhealthyFetch,
      vercelDeps: errorDeploy,
      sentryDeps: activeSentry,
    });
    expect(result.verdict).toBe('still_failing');
  });

  it('returns partial when some checks pass and some fail', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await verifyRecovery({
      config,
      sentryIssueId: 'issue-1',
      fetchImpl: healthyFetch,
      vercelDeps: readyDeploy,
      sentryDeps: activeSentry,
    });
    expect(result.verdict).toBe('partial');
  });

  it('returns needs_human when all checks are skipped', async () => {
    const config = createTestConfig();
    // deploy_check won't skip because vercel.projectId is always set in test config.
    // Override vercel projectId and target to force all skips.
    config.vercel.projectId = '';
    config.target.vercelProjectId = undefined;
    const result = await verifyRecovery({ config });
    expect(result.verdict).toBe('needs_human');
  });

  it('includes timing information', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await verifyRecovery({
      config,
      fetchImpl: healthyFetch,
      vercelDeps: readyDeploy,
      sentryDeps: resolvedSentry,
    });
    expect(result.verifiedAt).toBeTruthy();
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.checks.every((c) => c.durationMs >= 0)).toBe(true);
  });
});
