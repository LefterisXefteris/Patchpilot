import type { VerificationResult, RecoveryVerdict } from '../verification/types.js';

export type RecoveryAction = 'close' | 'retry' | 'wait' | 'escalate';

export type RecoveryAttemptRecord = {
  incidentId: string;
  sentryIssueId?: string;
  attemptNumber: number;
  verdict: RecoveryVerdict;
  action: RecoveryAction;
  reason: string;
  partialStreak: number;
  verifiedAt: string;
};

export type RecoveryDecision = {
  action: RecoveryAction;
  reason: string;
  attemptNumber: number;
  partialStreak: number;
};

export type RecoveryRunResult = {
  incidentId: string;
  sentryIssueId?: string;
  issueNumber: number;
  issueUrl?: string;
  verdict: RecoveryVerdict;
  decision: RecoveryDecision;
  applied: boolean;
  reason?: string;
  verification: VerificationResult;
};

export type RecoveryRunSummary = {
  ok: boolean;
  apply: boolean;
  scanned: number;
  results: RecoveryRunResult[];
};
