import type { AppConfig } from '../config/schema.js';
import { checkProductionHealth, type FetchLike } from './health-check.js';
import { checkVercelDeployment, type DeployCheckDependencies } from './deploy-check.js';
import {
  checkSentryPerformanceRecovery,
  type PerformanceCheckDependencies,
  type PerformanceCheckInput,
} from './performance-check.js';
import { checkSentryQuieting, type SentryCheckDependencies } from './sentry-check.js';
import type { CheckResult, RecoveryVerdict, VerificationResult } from './types.js';

export type VerifyRecoveryInput = {
  config: AppConfig;
  sentryIssueId?: string;
  fetchImpl?: FetchLike;
  vercelDeps?: DeployCheckDependencies;
  sentryDeps?: SentryCheckDependencies;
};

export type VerifyPerformanceRecoveryInput = {
  config: AppConfig;
  performance: PerformanceCheckInput;
  fetchImpl?: FetchLike;
  vercelDeps?: DeployCheckDependencies;
  performanceDeps?: PerformanceCheckDependencies;
};

export async function verifyRecovery(input: VerifyRecoveryInput): Promise<VerificationResult> {
  const start = Date.now();

  const [deployResult, healthResult, sentryResult] = await Promise.all([
    checkVercelDeployment(input.config, input.vercelDeps),
    checkProductionHealth(input.config, input.fetchImpl),
    checkSentryQuieting(input.config, input.sentryIssueId ?? '', input.sentryDeps),
  ]);

  const checks = [deployResult, healthResult, sentryResult];
  const verdict = computeVerdict(checks);
  const summary = buildSummary(verdict, checks);
  const deploymentAgeSeconds = readNumber(deployResult.details, 'ageSeconds');

  return {
    verdict,
    checks,
    summary,
    verifiedAt: new Date().toISOString(),
    totalDurationMs: Date.now() - start,
    deploymentAgeSeconds,
  };
}

export async function verifyPerformanceRecovery(input: VerifyPerformanceRecoveryInput): Promise<VerificationResult> {
  const start = Date.now();

  const [deployResult, healthResult, performanceResult] = await Promise.all([
    checkVercelDeployment(input.config, input.vercelDeps),
    checkProductionHealth(input.config, input.fetchImpl),
    checkSentryPerformanceRecovery(input.config, input.performance, input.performanceDeps),
  ]);

  const checks = [deployResult, healthResult, performanceResult];
  const verdict = computeVerdict(checks);
  const summary = buildSummary(verdict, checks);
  const deploymentAgeSeconds = readNumber(deployResult.details, 'ageSeconds');

  return {
    verdict,
    checks,
    summary,
    verifiedAt: new Date().toISOString(),
    totalDurationMs: Date.now() - start,
    deploymentAgeSeconds,
  };
}

function computeVerdict(checks: CheckResult[]): RecoveryVerdict {
  const active = checks.filter((c) => c.status !== 'skipped');
  if (active.length === 0) {
    return 'needs_human';
  }

  const allPass = active.every((c) => c.status === 'pass');
  if (allPass) {
    return 'recovered';
  }

  const anyFail = active.some((c) => c.status === 'fail');
  const anyPass = active.some((c) => c.status === 'pass');

  if (anyFail && !anyPass) {
    return 'still_failing';
  }

  if (anyFail && anyPass) {
    return 'partial';
  }

  return 'needs_human';
}

function buildSummary(verdict: RecoveryVerdict, checks: CheckResult[]): string {
  const lines = [`Recovery verdict: ${verdict}`];
  for (const check of checks) {
    lines.push(`  ${check.name}: ${check.status} — ${check.message}`);
  }
  return lines.join('\n');
}

function readNumber(details: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!details) {
    return undefined;
  }
  const value = details[key];
  return typeof value === 'number' ? value : undefined;
}
