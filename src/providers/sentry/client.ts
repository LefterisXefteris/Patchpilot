import type { AppConfig } from '../../config/schema.js';
import { redactText } from '../../security/redact.js';
import type { IntegrationValidationResult } from '../../types/integration-validation.js';

export type FetchLike = typeof fetch;

export class SentryClient {
  constructor(
    private readonly config: AppConfig['sentry'],
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async validateAccess(): Promise<IntegrationValidationResult> {
    const checkedAt = new Date().toISOString();
    const url = new URL(
      `/api/0/projects/${this.config.orgSlug}/${this.config.projectSlug}/`,
      this.config.regionUrl,
    );

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.authToken}`,
        },
      });

      if (!response.ok) {
        return {
          provider: 'sentry',
          ok: false,
          checkedAt,
          details: {
            orgSlug: this.config.orgSlug,
            projectSlug: this.config.projectSlug,
            environment: this.config.environment,
            hasAccess: false,
          },
          errorCode: `sentry_http_${response.status}`,
          errorMessage: redactText(response.statusText || `HTTP ${response.status}`, [this.config.authToken]),
        };
      }

      return {
        provider: 'sentry',
        ok: true,
        checkedAt,
        details: {
          orgSlug: this.config.orgSlug,
          projectSlug: this.config.projectSlug,
          environment: this.config.environment,
          hasAccess: true,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        provider: 'sentry',
        ok: false,
        checkedAt,
        details: {
          orgSlug: this.config.orgSlug,
          projectSlug: this.config.projectSlug,
          environment: this.config.environment,
          hasAccess: false,
        },
        errorCode: 'sentry_request_failed',
        errorMessage: redactText(errorMessage, [this.config.authToken]),
      };
    }
  }
}
