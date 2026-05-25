import type { AppConfig } from '../../config/schema.js';
import { redactText } from '../../security/redact.js';

export type ProductImpactEvent = {
  event: string;
  currentCount: number;
  currentActors: number;
  baselineCount: number;
  baselineActors: number;
  deltaCount: number;
  deltaPercent?: number;
};

export type ProductImpactSummary = {
  provider: 'posthog';
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
  impactEvents: ProductImpactEvent[];
  totalCurrentCount: number;
  totalBaselineCount: number;
  totalCurrentActors: number;
  totalBaselineActors: number;
  totalDeltaCount: number;
  totalDeltaPercent?: number;
  summary: string;
};

export type ProductImpactInput = {
  anchorTime?: string;
};

export type FetchLike = typeof fetch;

type ImpactRow = {
  event: string;
  count: number;
  actors: number;
};

export class PostHogImpactClient {
  constructor(
    private readonly config: AppConfig['posthog'],
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async summarizeProductImpact(input: ProductImpactInput = {}): Promise<ProductImpactSummary | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    if (!this.config.personalApiKey || !this.config.projectId) {
      throw new Error('POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID are required when POSTHOG_ENABLED=true');
    }

    const events = this.config.impactEvents.map((event) => event.trim()).filter(Boolean);
    if (!events.length) {
      return undefined;
    }

    const anchor = input.anchorTime ? safeDate(input.anchorTime) : new Date();
    const windowEnd = anchor;
    const windowStart = new Date(windowEnd.getTime() - this.config.windowHours * 60 * 60_000);
    const baselineEnd = windowStart;
    const baselineStart = new Date(baselineEnd.getTime() - this.config.baselineHours * 60 * 60_000);

    const [currentRows, baselineRows] = await Promise.all([
      this.queryImpact(events, windowStart, windowEnd, 'patchpilot_product_impact_current'),
      this.queryImpact(events, baselineStart, baselineEnd, 'patchpilot_product_impact_baseline'),
    ]);

    const current = new Map(currentRows.map((row) => [row.event, row]));
    const baseline = new Map(baselineRows.map((row) => [row.event, row]));
    const impactEvents = events.map((event) => toImpactEvent(event, current.get(event), baseline.get(event)));
    const totalCurrentCount = sum(impactEvents, 'currentCount');
    const totalBaselineCount = sum(impactEvents, 'baselineCount');
    const totalCurrentActors = sum(impactEvents, 'currentActors');
    const totalBaselineActors = sum(impactEvents, 'baselineActors');
    const totalDeltaCount = totalCurrentCount - totalBaselineCount;
    const totalDeltaPercent = percentChange(totalCurrentCount, totalBaselineCount);

    return {
      provider: 'posthog',
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      baselineStart: baselineStart.toISOString(),
      baselineEnd: baselineEnd.toISOString(),
      impactEvents,
      totalCurrentCount,
      totalBaselineCount,
      totalCurrentActors,
      totalBaselineActors,
      totalDeltaCount,
      totalDeltaPercent,
      summary: buildImpactSummary(totalCurrentCount, totalBaselineCount, totalDeltaPercent),
    };
  }

  private async queryImpact(events: string[], start: Date, end: Date, name: string): Promise<ImpactRow[]> {
    const url = new URL(`/api/projects/${this.config.projectId}/query/`, this.config.host);
    const query = [
      'SELECT event, count() AS event_count, uniq(distinct_id) AS actor_count',
      'FROM events',
      `WHERE event IN (${events.map(sqlString).join(', ')})`,
      `AND timestamp >= toDateTime(${sqlString(start.toISOString())})`,
      `AND timestamp < toDateTime(${sqlString(end.toISOString())})`,
      'GROUP BY event',
      'ORDER BY event_count DESC',
      `LIMIT ${events.length}`,
    ].join('\n');

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.personalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: { kind: 'HogQLQuery', query },
        name,
      }),
    });

    if (!response.ok) {
      throw new Error(
        redactText(`PostHog request failed: ${response.status} ${response.statusText}`, [this.config.personalApiKey]),
      );
    }

    const body = (await response.json()) as unknown;
    return parseQueryRows(body);
  }
}

export function formatProductImpactMarkdown(summary: ProductImpactSummary | undefined): string[] {
  if (!summary) {
    return [];
  }

  return [
    '## Product Impact',
    '',
    `**Provider:** PostHog`,
    `**Window:** ${summary.windowStart} to ${summary.windowEnd}`,
    `**Baseline:** ${summary.baselineStart} to ${summary.baselineEnd}`,
    `**Summary:** ${summary.summary}`,
    '',
    '| Event | Current | Baseline | Delta | Actors |',
    '|---|---:|---:|---:|---:|',
    ...summary.impactEvents.map((event) => {
      const delta = event.deltaPercent == null ? `${event.deltaCount}` : `${event.deltaCount} (${event.deltaPercent}%)`;
      return `| ${event.event} | ${event.currentCount} | ${event.baselineCount} | ${delta} | ${event.currentActors} |`;
    }),
  ];
}

function parseQueryRows(body: unknown): ImpactRow[] {
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new Error('Unexpected PostHog query response: missing results array');
  }

  return body.results
    .filter(Array.isArray)
    .map((row) => ({
      event: String(row[0] ?? ''),
      count: toNumber(row[1]),
      actors: toNumber(row[2]),
    }))
    .filter((row) => row.event);
}

function toImpactEvent(event: string, current?: ImpactRow, baseline?: ImpactRow): ProductImpactEvent {
  const currentCount = current?.count ?? 0;
  const baselineCount = baseline?.count ?? 0;
  return {
    event,
    currentCount,
    currentActors: current?.actors ?? 0,
    baselineCount,
    baselineActors: baseline?.actors ?? 0,
    deltaCount: currentCount - baselineCount,
    deltaPercent: percentChange(currentCount, baselineCount),
  };
}

function buildImpactSummary(current: number, baseline: number, deltaPercent: number | undefined): string {
  if (baseline === 0 && current === 0) {
    return 'No configured impact events were observed in the current or baseline window.';
  }
  if (deltaPercent == null) {
    return `${current} configured impact events observed in the current window.`;
  }
  const direction = deltaPercent >= 0 ? 'up' : 'down';
  return `${current} configured impact events observed, ${direction} ${Math.abs(deltaPercent)}% versus baseline.`;
}

function percentChange(current: number, baseline: number): number | undefined {
  if (baseline === 0) {
    return undefined;
  }
  return Number((((current - baseline) / baseline) * 100).toFixed(1));
}

function sum(events: ProductImpactEvent[], key: keyof Pick<ProductImpactEvent, 'currentCount' | 'baselineCount' | 'currentActors' | 'baselineActors'>): number {
  return events.reduce((total, event) => total + event[key], 0);
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function safeDate(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
