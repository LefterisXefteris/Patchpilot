import { describe, it, expect } from 'vitest';
import { decide } from '../src/recovery/decide.js';
import type { VerificationResult } from '../src/verification/types.js';
import type { RecoveryAttemptRecord } from '../src/recovery/types.js';

const basePolicy = {
  maxAttempts: 3,
  partialToleranceCycles: 2,
  minDeployAgeSeconds: 60,
  needsHumanLabel: 'needs-human',
  resolvedLabel: 'auto-recovery-resolved',
};

function verification(verdict: VerificationResult['verdict']): VerificationResult {
  return {
    verdict,
    checks: [],
    summary: '',
    verifiedAt: new Date().toISOString(),
    totalDurationMs: 1,
  };
}

function priorAttempt(overrides: Partial<RecoveryAttemptRecord> = {}): RecoveryAttemptRecord {
  return {
    incidentId: 'incident_1',
    attemptNumber: 1,
    verdict: 'still_failing',
    action: 'retry',
    reason: '',
    partialStreak: 0,
    verifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('decide', () => {
  it('closes the incident when verdict is recovered', () => {
    const d = decide({ verification: verification('recovered'), policy: basePolicy });
    expect(d.action).toBe('close');
  });

  it('escalates immediately when verdict is needs_human', () => {
    const d = decide({ verification: verification('needs_human'), policy: basePolicy });
    expect(d.action).toBe('escalate');
  });

  it('triggers retry when still_failing and attempts remaining', () => {
    const d = decide({
      verification: verification('still_failing'),
      prior: priorAttempt({ attemptNumber: 1 }),
      policy: basePolicy,
    });
    expect(d.action).toBe('retry');
    expect(d.attemptNumber).toBe(2);
  });

  it('escalates when retries are exhausted', () => {
    const d = decide({
      verification: verification('still_failing'),
      prior: priorAttempt({ attemptNumber: 3 }),
      policy: basePolicy,
    });
    expect(d.action).toBe('escalate');
  });

  it('treats absent prior as first dispatch (counts as attempt 1)', () => {
    const d = decide({ verification: verification('still_failing'), policy: basePolicy });
    expect(d.action).toBe('retry');
    expect(d.attemptNumber).toBe(2);
  });

  it('waits on first partial verdict and tracks streak', () => {
    const d = decide({ verification: verification('partial'), policy: basePolicy });
    expect(d.action).toBe('wait');
    expect(d.partialStreak).toBe(1);
  });

  it('escalates when partial streak hits tolerance', () => {
    const d = decide({
      verification: verification('partial'),
      prior: priorAttempt({ partialStreak: 1 }),
      policy: basePolicy,
    });
    expect(d.action).toBe('escalate');
    expect(d.partialStreak).toBe(2);
  });
});
