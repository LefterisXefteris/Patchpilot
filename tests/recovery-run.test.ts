import { describe, it, expect, vi } from 'vitest';
import { runRecoveryLoop } from '../src/recovery/run-recovery.js';
import { sentryIssueMarker } from '../src/agent/sync.js';
import { createTestConfig } from './test-helpers.js';
import type { VerificationResult } from '../src/verification/types.js';
import type { RecoveryAttemptRecord } from '../src/recovery/types.js';
import type { GitHubIssueSummary } from '../src/providers/github/issues.js';

function verification(
  verdict: VerificationResult['verdict'],
  overrides: Partial<VerificationResult> = {},
): VerificationResult {
  return {
    verdict,
    checks: [],
    summary: `Recovery verdict: ${verdict}`,
    verifiedAt: new Date().toISOString(),
    totalDurationMs: 1,
    ...overrides,
  };
}

function issue(number: number, sentryId: string, labels: string[] = []): GitHubIssueSummary {
  return {
    number,
    title: `[Sentry NODE-${sentryId}] boom`,
    body: `${sentryIssueMarker(sentryId)}\nBody`,
    htmlUrl: `https://github.com/acme/web/issues/${number}`,
    labels,
  };
}

function createInMemoryStore() {
  const records = new Map<string, RecoveryAttemptRecord>();
  return {
    init: () => undefined,
    getLatestRecoveryAttempt: (id: string) => records.get(id),
    recordRecoveryAttempt: (record: RecoveryAttemptRecord) => {
      records.set(record.incidentId, record);
    },
    records,
  };
}

function createGithubMock() {
  return {
    listIncidentIssues: vi.fn<() => Promise<GitHubIssueSummary[]>>(),
    addIssueComment: vi.fn(async () => undefined),
    addIssueLabels: vi.fn(async () => undefined),
    closeIssue: vi.fn(async () => undefined),
    createRepositoryDispatch: vi.fn(async () => undefined),
  };
}

describe('runRecoveryLoop', () => {
  it('closes the GitHub issue when verification reports recovered', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const github = createGithubMock();
    github.listIncidentIssues.mockResolvedValue([issue(1, '1001')]);
    const store = createInMemoryStore();

    const summary = await runRecoveryLoop(
      config,
      { apply: true },
      { github, store, verify: async () => verification('recovered') },
    );

    expect(summary.results[0]?.decision.action).toBe('close');
    expect(github.closeIssue).toHaveBeenCalledWith(1);
    expect(github.addIssueLabels).toHaveBeenCalledWith(1, ['auto-recovery-resolved']);
    expect(store.records.get('incident_1001')?.action).toBe('close');
    vi.restoreAllMocks();
  });

  it('dispatches Claude retry when still failing and attempts remain', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const github = createGithubMock();
    github.listIncidentIssues.mockResolvedValue([issue(2, '1002')]);
    const store = createInMemoryStore();

    const summary = await runRecoveryLoop(
      config,
      { apply: true },
      { github, store, verify: async () => verification('still_failing') },
    );

    expect(summary.results[0]?.decision.action).toBe('retry');
    expect(summary.results[0]?.decision.attemptNumber).toBe(2);
    expect(github.createRepositoryDispatch).toHaveBeenCalledWith(
      'back-to-service.incident',
      expect.objectContaining({ retry: true, attemptNumber: 2, sentryIssueId: '1002' }),
    );
    vi.restoreAllMocks();
  });

  it('escalates after exhausting max attempts', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const config = createTestConfig({
      target: { productionUrl: 'https://example.com' },
      recovery: {
        maxAttempts: 2,
        partialToleranceCycles: 2,
        minDeployAgeSeconds: 0,
        needsHumanLabel: 'needs-human',
        resolvedLabel: 'auto-recovery-resolved',
      },
    });
    const github = createGithubMock();
    github.listIncidentIssues.mockResolvedValue([issue(3, '1003')]);
    const store = createInMemoryStore();
    store.records.set('incident_1003', {
      incidentId: 'incident_1003',
      sentryIssueId: '1003',
      attemptNumber: 2,
      verdict: 'still_failing',
      action: 'retry',
      reason: '',
      partialStreak: 0,
      verifiedAt: new Date().toISOString(),
    });

    const summary = await runRecoveryLoop(
      config,
      { apply: true },
      { github, store, verify: async () => verification('still_failing') },
    );

    expect(summary.results[0]?.decision.action).toBe('escalate');
    expect(github.addIssueLabels).toHaveBeenCalledWith(3, ['needs-human']);
    expect(github.createRepositoryDispatch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('skips issues already labelled needs-human or auto-recovery-resolved', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const github = createGithubMock();
    github.listIncidentIssues.mockResolvedValue([
      issue(4, '1004', ['needs-human']),
      issue(5, '1005', ['auto-recovery-resolved']),
    ]);
    const store = createInMemoryStore();

    const summary = await runRecoveryLoop(
      config,
      { apply: true },
      { github, store, verify: async () => verification('recovered') },
    );

    expect(summary.results).toHaveLength(0);
    expect(github.closeIssue).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('waits when latest deployment is too fresh to verify', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const config = createTestConfig({
      target: { productionUrl: 'https://example.com' },
      recovery: {
        maxAttempts: 3,
        partialToleranceCycles: 2,
        minDeployAgeSeconds: 300,
        needsHumanLabel: 'needs-human',
        resolvedLabel: 'auto-recovery-resolved',
      },
    });
    const github = createGithubMock();
    github.listIncidentIssues.mockResolvedValue([issue(6, '1006')]);
    const store = createInMemoryStore();

    const summary = await runRecoveryLoop(
      config,
      { apply: true },
      {
        github,
        store,
        verify: async () => verification('still_failing', { deploymentAgeSeconds: 30 }),
      },
    );

    expect(summary.results[0]?.decision.action).toBe('wait');
    expect(summary.results[0]?.reason).toBe('deploy_too_fresh');
    expect(github.createRepositoryDispatch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('does not mutate GitHub when apply is false', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const github = createGithubMock();
    github.listIncidentIssues.mockResolvedValue([issue(7, '1007')]);
    const store = createInMemoryStore();

    const summary = await runRecoveryLoop(
      config,
      { apply: false },
      { github, store, verify: async () => verification('recovered') },
    );

    expect(summary.apply).toBe(false);
    expect(github.closeIssue).not.toHaveBeenCalled();
    expect(github.addIssueLabels).not.toHaveBeenCalled();
    expect(github.createRepositoryDispatch).not.toHaveBeenCalled();
    expect(summary.results[0]?.decision.action).toBe('close');
    vi.restoreAllMocks();
  });
});
