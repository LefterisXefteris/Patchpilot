export type CheckStatus = 'pass' | 'fail' | 'degraded' | 'skipped';

export type CheckResult = {
  name: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
  durationMs: number;
};

export type RecoveryVerdict = 'recovered' | 'still_failing' | 'needs_human' | 'partial';

export type VerificationResult = {
  verdict: RecoveryVerdict;
  checks: CheckResult[];
  summary: string;
  verifiedAt: string;
  totalDurationMs: number;
};
