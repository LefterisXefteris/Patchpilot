import { describe, it, expect } from 'vitest';
import { checkProductionHealth, type FetchLike } from '../src/verification/health-check.js';
import { createTestConfig } from './test-helpers.js';

function mockFetch(status: number): FetchLike {
  const body = [101, 204, 205, 304].includes(status) ? null : '';
  return async () => new Response(body, { status });
}

function failingFetch(error: string): FetchLike {
  return async () => { throw new Error(error); };
}

describe('checkProductionHealth', () => {
  it('returns pass when production responds with expected status', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await checkProductionHealth(config, mockFetch(200));
    expect(result.status).toBe('pass');
    expect(result.name).toBe('health_check');
  });

  it('returns fail when production responds with unexpected status', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await checkProductionHealth(config, mockFetch(500));
    expect(result.status).toBe('fail');
    expect(result.message).toContain('500');
  });

  it('returns fail on network error', async () => {
    const config = createTestConfig({ target: { productionUrl: 'https://example.com' } });
    const result = await checkProductionHealth(config, failingFetch('ECONNREFUSED'));
    expect(result.status).toBe('fail');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('returns skipped when no production URL configured', async () => {
    const config = createTestConfig();
    const result = await checkProductionHealth(config, mockFetch(200));
    expect(result.status).toBe('skipped');
  });

  it('uses custom health check path', async () => {
    let requestedUrl = '';
    const capturingFetch: FetchLike = async (url) => {
      requestedUrl = String(url);
      return new Response('', { status: 200 });
    };
    const config = createTestConfig({
      target: { productionUrl: 'https://example.com', healthCheckPath: '/api/health' },
    });
    await checkProductionHealth(config, capturingFetch);
    expect(requestedUrl).toBe('https://example.com/api/health');
  });

  it('respects custom expected status', async () => {
    const config = createTestConfig({
      target: { productionUrl: 'https://example.com', healthCheckExpectedStatus: 204 },
    });
    const result = await checkProductionHealth(config, mockFetch(204));
    expect(result.status).toBe('pass');
  });
});
