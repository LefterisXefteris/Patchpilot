import type { AppConfig } from '../../config/schema.js';
import { redactText } from '../../security/redact.js';

export type PerformanceIncidentKind = 'error' | 'performance';

export type SentryPerformanceBottleneck = {
  kind: 'performance';
  id: string;
  fingerprint: string;
  transaction: string;
  spanOp: string;
  spanDescription: string;
  project?: string;
  release?: string;
  environment: string;
  count: number;
  avgMs: number;
  p75Ms: number;
  p95Ms: number;
  p99Ms: number;
  baselineP95Ms?: number;
  regressionRatio?: number;
  severity: 'low' | 'medium' | 'high';
  permalink?: string;
};

export type SentryPerformanceOptions = {
  limit?: number;
  now?: Date;
};

export type FetchLike = typeof fetch;

const fields = [
  'transaction',
  'span.op',
  'span.description',
  'project',
  'release',
  'count()',
  'avg(span.duration)',
  'p75(span.duration)',
  'p95(span.duration)',
  'p99(span.duration)',
];

const p95Field = 'p95(span.duration)';

export class SentryPerformanceClient {
  constructor(
    private readonly sentryConfig: AppConfig['sentry'],
    private readonly performanceConfig: AppConfig['performance'],
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async listProductionBottlenecks(options: SentryPerformanceOptions = {}): Promise<SentryPerformanceBottleneck[]> {
    if (!this.performanceConfig.enabled) {
      return [];
    }

    const projectId = await this.retrieveProjectId();
    const limit = options.limit ?? 10;
    const now = options.now ?? new Date();
    const currentRows = await this.queryExplore(projectId, { limit, statsPeriod: '24h' });
    const baselineRows = await this.queryExplore(projectId, {
      limit: 100,
      start: new Date(now.getTime() - 48 * 60 * 60_000),
      end: new Date(now.getTime() - 24 * 60 * 60_000),
    });
    const baselines = new Map(baselineRows.map((row) => [rowKey(row), row]));

    return currentRows
      .map((row) => this.toBottleneck(row, baselines.get(rowKey(row))))
      .filter((bottleneck): bottleneck is SentryPerformanceBottleneck => bottleneck !== undefined)
      .filter((bottleneck) => bottleneck.count >= this.performanceConfig.minSampleCount)
      .filter((bottleneck) => bottleneck.p95Ms >= this.performanceConfig.p95ThresholdMs)
      .filter((bottleneck) => {
        if (bottleneck.baselineP95Ms == null || bottleneck.baselineP95Ms <= 0) {
          return true;
        }
        return (bottleneck.regressionRatio ?? 0) >= this.performanceConfig.regressionRatio;
      })
      .slice(0, limit);
  }

  async getProductionBottleneck(
    fingerprint: string,
    options: SentryPerformanceOptions = {},
  ): Promise<SentryPerformanceBottleneck | undefined> {
    if (!this.performanceConfig.enabled) {
      return undefined;
    }

    const projectId = await this.retrieveProjectId();
    const limit = options.limit ?? 100;
    const now = options.now ?? new Date();
    const currentRows = await this.queryExplore(projectId, { limit, statsPeriod: '24h' });
    const baselineRows = await this.queryExplore(projectId, {
      limit: 100,
      start: new Date(now.getTime() - 48 * 60 * 60_000),
      end: new Date(now.getTime() - 24 * 60 * 60_000),
    });
    const baselines = new Map(baselineRows.map((row) => [rowKey(row), row]));

    return currentRows
      .map((row) => this.toBottleneck(row, baselines.get(rowKey(row))))
      .find((bottleneck) => bottleneck?.fingerprint === fingerprint);
  }

  private async retrieveProjectId(): Promise<string> {
    const url = new URL(
      `/api/0/projects/${this.sentryConfig.orgSlug}/${this.sentryConfig.projectSlug}/`,
      this.sentryConfig.regionUrl,
    );
    const response = await this.fetchJson(url);
    const id = readString(response, 'id');

    if (!id) {
      throw new Error('Unexpected Sentry project response: missing id');
    }

    return id;
  }

  private async queryExplore(
    projectId: string,
    options: { limit: number; statsPeriod?: string; start?: Date; end?: Date },
  ): Promise<Record<string, unknown>[]> {
    const url = new URL(`/api/0/organizations/${this.sentryConfig.orgSlug}/events/`, this.sentryConfig.regionUrl);
    url.searchParams.set('dataset', 'spans');
    url.searchParams.append('project', projectId);
    url.searchParams.append('environment', this.sentryConfig.environment);
    url.searchParams.set('per_page', String(options.limit));
    url.searchParams.set('sort', `-${p95Field}`);
    url.searchParams.set('query', this.buildQuery());
    for (const field of fields) {
      url.searchParams.append('field', field);
    }

    if (options.statsPeriod) {
      url.searchParams.set('statsPeriod', options.statsPeriod);
    } else if (options.start && options.end) {
      url.searchParams.set('start', options.start.toISOString());
      url.searchParams.set('end', options.end.toISOString());
    }

    const response = await this.fetchJson(url);
    const data = readArray(response, 'data');
    if (!data) {
      throw new Error('Unexpected Sentry performance response: missing data array');
    }

    return data.filter(isRecord);
  }

  private buildQuery(): string {
    const ops = this.performanceConfig.allowedOps.map((op) => op.trim()).filter(Boolean);
    if (!ops.length) {
      return 'event.type:transaction';
    }

    return `event.type:transaction span.op:[${ops.join(',')}]`;
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.sentryConfig.authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        redactText(`Sentry request failed: ${response.status} ${response.statusText}`, [this.sentryConfig.authToken]),
      );
    }

    return response.json() as Promise<unknown>;
  }

  private toBottleneck(
    row: Record<string, unknown>,
    baseline?: Record<string, unknown>,
  ): SentryPerformanceBottleneck | undefined {
    const transaction = readRowString(row, 'transaction') ?? 'unknown transaction';
    const spanOp = readRowString(row, 'span.op') ?? 'unknown';
    const spanDescription = sanitizeSpanDescription(readRowString(row, 'span.description') ?? 'unknown span');
    const p95Ms = readRowNumber(row, p95Field);
    const count = readRowNumber(row, 'count()');

    if (p95Ms == null || count == null) {
      return undefined;
    }

    const baselineP95Ms = baseline ? readRowNumber(baseline, p95Field) : undefined;
    const regressionRatio = baselineP95Ms && baselineP95Ms > 0 ? round(p95Ms / baselineP95Ms, 2) : undefined;
    const severity = performanceSeverity({
      p95Ms,
      thresholdMs: this.performanceConfig.p95ThresholdMs,
      regressionRatio,
      requiredRegressionRatio: this.performanceConfig.regressionRatio,
    });
    const fingerprint = performanceFingerprint(this.sentryConfig.environment, transaction, spanOp, spanDescription);

    return {
      kind: 'performance',
      id: fingerprint,
      fingerprint,
      transaction,
      spanOp,
      spanDescription,
      project: readRowString(row, 'project'),
      release: readRowString(row, 'release'),
      environment: this.sentryConfig.environment,
      count,
      avgMs: readRowNumber(row, 'avg(span.duration)') ?? 0,
      p75Ms: readRowNumber(row, 'p75(span.duration)') ?? 0,
      p95Ms,
      p99Ms: readRowNumber(row, 'p99(span.duration)') ?? p95Ms,
      baselineP95Ms,
      regressionRatio,
      severity,
      permalink: this.buildPermalink(transaction),
    };
  }

  private buildPermalink(transaction: string): string {
    const url = new URL(`/organizations/${this.sentryConfig.orgSlug}/traces/`, this.sentryConfig.regionUrl);
    url.searchParams.set('project', this.sentryConfig.projectSlug);
    url.searchParams.set('environment', this.sentryConfig.environment);
    url.searchParams.set('query', `transaction:${transaction}`);
    return url.toString();
  }
}

export function performanceSeverity(input: {
  p95Ms: number;
  thresholdMs: number;
  regressionRatio?: number;
  requiredRegressionRatio: number;
}): 'low' | 'medium' | 'high' {
  const thresholdMultiple = input.thresholdMs > 0 ? input.p95Ms / input.thresholdMs : 1;
  const regressionMultiple =
    input.regressionRatio && input.requiredRegressionRatio > 0 ? input.regressionRatio / input.requiredRegressionRatio : 1;

  if (thresholdMultiple >= 2 || (input.regressionRatio ?? 0) >= 2 || regressionMultiple >= 2) {
    return 'high';
  }
  if (thresholdMultiple >= 1.25 || regressionMultiple >= 1.25) {
    return 'medium';
  }
  return 'low';
}

export function performanceFingerprint(environment: string, transaction: string, spanOp: string, spanDescription: string): string {
  const raw = ['perf', environment, spanOp, transaction, spanDescription].join(':');
  return raw.toLowerCase().replace(/[^a-z0-9._:/-]+/g, '-').slice(0, 180);
}

export function sanitizeSpanDescription(description: string): string {
  return description
    .replace(/'[^']*'/g, "'?'")
    .replace(/"[^"]*"/g, '"?"')
    .replace(/\b[A-Fa-f0-9]{16,}\b/g, '[id]')
    .replace(/\b\d{3,}\b/g, '?')
    .replace(/\b(token|secret|password|authorization)=([^\s&]+)/gi, '$1=[REDACTED]')
    .slice(0, 240);
}

function rowKey(row: Record<string, unknown>): string {
  return [
    readRowString(row, 'transaction') ?? '',
    readRowString(row, 'span.op') ?? '',
    readRowString(row, 'span.description') ?? '',
  ].join('\0');
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const raw = value[key];
  return typeof raw === 'string' ? raw : undefined;
}

function readArray(value: unknown, key: string): unknown[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const raw = value[key];
  return Array.isArray(raw) ? raw : undefined;
}

function readRowString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readRowNumber(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
