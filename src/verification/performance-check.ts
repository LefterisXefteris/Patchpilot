import type { AppConfig } from '../config/schema.js';
import { SentryPerformanceClient, type SentryPerformanceBottleneck } from '../providers/sentry/performance.js';
import type { CheckResult } from './types.js';

export type PerformanceCheckInput = {
  fingerprint: string;
  baselineP95Ms?: number;
};

export type PerformanceCheckDependencies = {
  getBottleneck: (fingerprint: string) => Promise<SentryPerformanceBottleneck | undefined>;
};

export async function checkSentryPerformanceRecovery(
  config: AppConfig,
  input: PerformanceCheckInput | undefined,
  deps?: PerformanceCheckDependencies,
): Promise<CheckResult> {
  const start = Date.now();

  if (!input?.fingerprint) {
    return {
      name: 'sentry_performance_check',
      status: 'skipped',
      message: 'No Sentry performance fingerprint provided for verification',
      durationMs: Date.now() - start,
    };
  }

  const fetcher = deps ?? createDefaultDeps(config);

  try {
    const bottleneck = await fetcher.getBottleneck(input.fingerprint);
    if (!bottleneck) {
      return {
        name: 'sentry_performance_check',
        status: 'pass',
        message: `Sentry performance bottleneck ${input.fingerprint} is no longer above intake thresholds`,
        details: { fingerprint: input.fingerprint },
        durationMs: Date.now() - start,
      };
    }

    if (bottleneck.count < config.performance.minSampleCount) {
      return {
        name: 'sentry_performance_check',
        status: 'degraded',
        message: `Only ${bottleneck.count} samples available for performance verification`,
        details: {
          fingerprint: input.fingerprint,
          sampleCount: bottleneck.count,
          minSampleCount: config.performance.minSampleCount,
          p95Ms: bottleneck.p95Ms,
        },
        durationMs: Date.now() - start,
      };
    }

    const baselineP95Ms = input.baselineP95Ms ?? bottleneck.baselineP95Ms;
    const improvedAgainstBaseline = baselineP95Ms != null && bottleneck.p95Ms < baselineP95Ms;
    const belowThreshold = bottleneck.p95Ms < config.performance.p95ThresholdMs;

    if (belowThreshold || improvedAgainstBaseline) {
      return {
        name: 'sentry_performance_check',
        status: 'pass',
        message: `Performance improved for ${bottleneck.transaction} (p95 ${Math.round(bottleneck.p95Ms)}ms)`,
        details: performanceDetails(input.fingerprint, bottleneck, baselineP95Ms),
        durationMs: Date.now() - start,
      };
    }

    return {
      name: 'sentry_performance_check',
      status: 'fail',
      message: `Performance bottleneck still active for ${bottleneck.transaction} (p95 ${Math.round(bottleneck.p95Ms)}ms)`,
      details: performanceDetails(input.fingerprint, bottleneck, baselineP95Ms),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'sentry_performance_check',
      status: 'fail',
      message: `Sentry performance check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { fingerprint: input.fingerprint },
      durationMs: Date.now() - start,
    };
  }
}

function createDefaultDeps(config: AppConfig): PerformanceCheckDependencies {
  return {
    getBottleneck: async (fingerprint) => {
      const client = new SentryPerformanceClient(config.sentry, config.performance);
      return client.getProductionBottleneck(fingerprint);
    },
  };
}

function performanceDetails(
  fingerprint: string,
  bottleneck: SentryPerformanceBottleneck,
  baselineP95Ms: number | undefined,
): Record<string, unknown> {
  return {
    fingerprint,
    transaction: bottleneck.transaction,
    spanOp: bottleneck.spanOp,
    spanDescription: bottleneck.spanDescription,
    sampleCount: bottleneck.count,
    p95Ms: bottleneck.p95Ms,
    baselineP95Ms,
    regressionRatio: baselineP95Ms && baselineP95Ms > 0 ? Number((bottleneck.p95Ms / baselineP95Ms).toFixed(2)) : undefined,
  };
}
