import { afterEach, describe, expect, it, vi } from 'vitest';

import { main } from '../src/index.js';

const providerEnvKeys = [
  'SENTRY_AUTH_TOKEN',
  'SENTRY_WEBHOOK_SECRET',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'VERCEL_TOKEN',
  'SENTRY_ORG_SLUG',
  'SENTRY_PROJECT_SLUG',
  'GITHUB_APP_ID',
  'GITHUB_INSTALLATION_ID',
  'GITHUB_OWNER',
  'GITHUB_REPO',
  'GITHUB_TARGET_INSTALLATION_ID',
  'GITHUB_TARGET_OWNER',
  'GITHUB_TARGET_REPO',
  'VERCEL_PROJECT_ID',
] as const;

describe('validate-config CLI', () => {
  const originalEnv = new Map<string, string | undefined>();

  afterEach(() => {
    delete process.env.BTS_ENV_FILE;
    for (const key of providerEnvKeys) {
      const original = originalEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
    originalEnv.clear();
    vi.restoreAllMocks();
  });

  it('returns config_invalid for missing config', async () => {
    clearProviderEnv();
    process.env.BTS_ENV_FILE = '.env.test-missing';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['validate-config']);

    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('config_invalid'));
  });

  it('redacts secret-like values in config errors', async () => {
    clearProviderEnv();
    process.env.BTS_ENV_FILE = '.env.test-missing';
    process.env.SENTRY_AUTH_TOKEN = 'leaky-token';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['validate-config']);

    expect(code).toBe(1);
    const output = String(log.mock.calls[0]?.[0] ?? '');
    expect(output).toContain('config_invalid');
    expect(output).not.toContain('leaky-token');
  });

  function clearProviderEnv(): void {
    for (const key of providerEnvKeys) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  }
});
