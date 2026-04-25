import type { AppConfig } from '../config/schema.js';
import { GitHubClient } from '../providers/github/client.js';
import { SentryClient } from '../providers/sentry/client.js';
import { VercelClient } from '../providers/vercel/client.js';
import type { ValidationSummary } from '../types/integration-validation.js';

export async function validateIntegrations(config: AppConfig): Promise<ValidationSummary> {
  const results = await Promise.all([
    new SentryClient(config.sentry).validateAccess(),
    new GitHubClient(config.github).validateAccess(),
    new VercelClient(config.vercel).validateAccess(),
  ]);

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}
