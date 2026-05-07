import type { AppConfig } from '../config/schema.js';
import type { CheckResult } from './types.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function checkProductionHealth(
  config: AppConfig,
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const start = Date.now();
  const baseUrl = config.target.productionUrl;

  if (!baseUrl) {
    return {
      name: 'health_check',
      status: 'skipped',
      message: 'BTS_TARGET_PRODUCTION_URL not configured',
      durationMs: Date.now() - start,
    };
  }

  const url = new URL(config.target.healthCheckPath, baseUrl).toString();
  const expected = config.target.healthCheckExpectedStatus;
  const timeoutMs = config.target.healthCheckTimeoutMs;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);

    const durationMs = Date.now() - start;
    const ok = response.status === expected;

    return {
      name: 'health_check',
      status: ok ? 'pass' : 'fail',
      message: ok
        ? `Production responded ${response.status} at ${url}`
        : `Expected ${expected} but got ${response.status} at ${url}`,
      details: { url, expectedStatus: expected, actualStatus: response.status, responseTimeMs: durationMs },
      durationMs,
    };
  } catch (error) {
    return {
      name: 'health_check',
      status: 'fail',
      message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { url, expectedStatus: expected },
      durationMs: Date.now() - start,
    };
  }
}
