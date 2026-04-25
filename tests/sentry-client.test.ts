import { describe, expect, it, vi } from 'vitest';

import { SentryClient } from '../src/providers/sentry/client.js';
import { validEnv } from './test-helpers.js';
import { loadConfigFromEnv } from '../src/config/env.js';

async function sentryConfig() {
  return (await loadConfigFromEnv(validEnv)).sentry;
}

describe('SentryClient', () => {
  it('validates project access with a GET request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, statusText: 'OK' }));
    const client = new SentryClient(await sentryConfig(), fetchMock);

    const result = await client.validateAccess();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'GET' }));
  });

  it('returns a stable code for unauthorized responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401, statusText: 'Unauthorized' }));
    const client = new SentryClient(await sentryConfig(), fetchMock);

    const result = await client.validateAccess();

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('sentry_http_401');
  });

  it('redacts thrown request errors', async () => {
    const config = await sentryConfig();
    const fetchMock = vi.fn().mockRejectedValue(new Error(`bad ${config.authToken}`));
    const client = new SentryClient(config, fetchMock);

    const result = await client.validateAccess();

    expect(result.errorCode).toBe('sentry_request_failed');
    expect(result.errorMessage).toContain('[REDACTED]');
    expect(result.errorMessage).not.toContain(config.authToken);
  });
});
