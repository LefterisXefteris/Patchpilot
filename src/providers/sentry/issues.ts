import type { AppConfig } from '../../config/schema.js';
import { redactText } from '../../security/redact.js';

export type SentryIssueSummary = {
  id: string;
  shortId: string;
  title: string;
  culprit?: string;
  permalink?: string;
  level?: string;
  status?: string;
  count?: string;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
};

export type FetchLike = typeof fetch;

export class SentryIssuesClient {
  constructor(
    private readonly config: AppConfig['sentry'],
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async listUnresolvedProductionIssues(limit = 10): Promise<SentryIssueSummary[]> {
    const projectId = await this.retrieveProjectId();
    const url = new URL(`/api/0/organizations/${this.config.orgSlug}/issues/`, this.config.regionUrl);
    url.searchParams.set('project', projectId);
    url.searchParams.set('environment', this.config.environment);
    url.searchParams.set('query', 'is:unresolved');
    url.searchParams.set('statsPeriod', '24h');
    url.searchParams.set('limit', String(limit));

    const response = await this.fetchJson(url);
    if (!Array.isArray(response)) {
      throw new Error('Unexpected Sentry issues response: expected array');
    }

    return response.slice(0, limit).map((issue) => this.toIssueSummary(issue));
  }

  private async retrieveProjectId(): Promise<string> {
    const url = new URL(
      `/api/0/projects/${this.config.orgSlug}/${this.config.projectSlug}/`,
      this.config.regionUrl,
    );
    const response = await this.fetchJson(url);
    const id = readString(response, 'id');

    if (!id) {
      throw new Error('Unexpected Sentry project response: missing id');
    }

    return id;
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        redactText(`Sentry request failed: ${response.status} ${response.statusText}`, [this.config.authToken]),
      );
    }

    return response.json() as Promise<unknown>;
  }

  private toIssueSummary(issue: unknown): SentryIssueSummary {
    return {
      id: readString(issue, 'id') ?? 'unknown',
      shortId: readString(issue, 'shortId') ?? readString(issue, 'short_id') ?? 'SENTRY-UNKNOWN',
      title: readString(issue, 'title') ?? 'Untitled Sentry issue',
      culprit: readString(issue, 'culprit'),
      permalink: readString(issue, 'permalink'),
      level: readString(issue, 'level'),
      status: readString(issue, 'status'),
      count: readString(issue, 'count'),
      userCount: readNumber(issue, 'userCount'),
      firstSeen: readString(issue, 'firstSeen'),
      lastSeen: readString(issue, 'lastSeen'),
    };
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' ? raw : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'number' ? raw : undefined;
}
