import type { AppConfig } from '../config/schema.js';
import type { VerificationResult } from '../verification/types.js';
import type { RecoveryAttemptRecord, RecoveryDecision } from './types.js';

export type DecideInput = {
  verification: VerificationResult;
  prior?: RecoveryAttemptRecord;
  policy: AppConfig['recovery'];
};

export function decide({ verification, prior, policy }: DecideInput): RecoveryDecision {
  const priorAttempt = prior?.attemptNumber ?? 1;
  const priorPartialStreak = prior?.partialStreak ?? 0;

  switch (verification.verdict) {
    case 'recovered':
      return {
        action: 'close',
        reason: 'Recovery verified — deployment, health, and Sentry checks all pass.',
        attemptNumber: priorAttempt,
        partialStreak: 0,
      };

    case 'needs_human':
      return {
        action: 'escalate',
        reason: 'Verification cannot determine recovery status without human review.',
        attemptNumber: priorAttempt,
        partialStreak: 0,
      };

    case 'partial': {
      const newStreak = priorPartialStreak + 1;
      if (newStreak >= policy.partialToleranceCycles) {
        return {
          action: 'escalate',
          reason: `Partial recovery for ${newStreak} consecutive cycles — escalating for human review.`,
          attemptNumber: priorAttempt,
          partialStreak: newStreak,
        };
      }
      return {
        action: 'wait',
        reason: `Partial recovery (cycle ${newStreak}/${policy.partialToleranceCycles}); waiting for propagation.`,
        attemptNumber: priorAttempt,
        partialStreak: newStreak,
      };
    }

    case 'still_failing': {
      if (priorAttempt >= policy.maxAttempts) {
        return {
          action: 'escalate',
          reason: `Exhausted ${policy.maxAttempts} Claude attempts without recovery — escalating.`,
          attemptNumber: priorAttempt,
          partialStreak: 0,
        };
      }
      const next = priorAttempt + 1;
      return {
        action: 'retry',
        reason: `Still failing — dispatching Claude retry attempt ${next}/${policy.maxAttempts}.`,
        attemptNumber: next,
        partialStreak: 0,
      };
    }
  }
}
