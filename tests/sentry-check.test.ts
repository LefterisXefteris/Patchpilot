import { describe, it, expect } from 'vitest';
import { checkSentryQuieting, type SentryCheckDependencies } from '../src/verification/sentry-check.js';
import { createTestConfig } from './test-helpers.js';

function mockDeps(status: string, lastSeenMinutesAgo: number): SentryCheckDependencies {
  return {
    getIssue: async () => ({
      status,
      count: '10',
      lastSeen: new Date(Date.now() - lastSeenMinutesAgo * 60_000).toISOString(),
    }),
  };
}

function failingDeps(error: string): SentryCheckDependencies {
  return { getIssue: async () => { throw new Error(error); } };
}

describe('checkSentryQuieting', () => {
  const config = createTestConfig();

  it('returns pass when issue is resolved', async () => {
    const result = await checkSentryQuieting(config, 'issue-1', mockDeps('resolved', 30));
    expect(result.status).toBe('pass');
    expect(result.message).toContain('resolved');
  });

  it('returns pass when issue is quiet for >10 minutes', async () => {
    const result = await checkSentryQuieting(config, 'issue-1', mockDeps('unresolved', 15));
    expect(result.status).toBe('pass');
    expect(result.message).toContain('quiet');
  });

  it('returns fail when issue is still active', async () => {
    const result = await checkSentryQuieting(config, 'issue-1', mockDeps('unresolved', 2));
    expect(result.status).toBe('fail');
    expect(result.message).toContain('still active');
  });

  it('returns degraded when issue is ignored', async () => {
    const result = await checkSentryQuieting(config, 'issue-1', mockDeps('ignored', 30));
    expect(result.status).toBe('degraded');
  });

  it('returns skipped when no issue ID provided', async () => {
    const result = await checkSentryQuieting(config, '', mockDeps('resolved', 30));
    expect(result.status).toBe('skipped');
  });

  it('returns fail on API error', async () => {
    const result = await checkSentryQuieting(config, 'issue-1', failingDeps('403 Forbidden'));
    expect(result.status).toBe('fail');
    expect(result.message).toContain('403 Forbidden');
  });
});
