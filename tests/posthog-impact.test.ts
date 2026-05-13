import { describe, expect, it, vi } from 'vitest';

import { formatProductImpactMarkdown, PostHogImpactClient } from '../src/providers/posthog/impact.js';
import { createTestConfig } from './test-helpers.js';

describe('PostHogImpactClient', () => {
  it('queries PostHog HogQL and summarizes product impact against baseline', async () => {
    const config = createTestConfig({
      posthog: {
        enabled: true,
        personalApiKey: 'posthog-secret',
        projectId: '12345',
        host: 'https://us.posthog.com',
        impactEvents: ['signup_completed', 'checkout_completed'],
        windowHours: 24,
        baselineHours: 24,
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              ['signup_completed', 12, 10],
              ['checkout_completed', 4, 4],
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              ['signup_completed', 20, 18],
              ['checkout_completed', 8, 7],
            ],
          }),
          { status: 200 },
        ),
      );

    const client = new PostHogImpactClient(config.posthog, fetchMock);
    const summary = await client.summarizeProductImpact({ anchorTime: '2026-05-13T12:00:00Z' });

    expect(summary).toMatchObject({
      provider: 'posthog',
      totalCurrentCount: 16,
      totalBaselineCount: 28,
      totalCurrentActors: 14,
      totalBaselineActors: 25,
      totalDeltaCount: -12,
      totalDeltaPercent: -42.9,
    });
    expect(summary?.impactEvents[0]).toMatchObject({
      event: 'signup_completed',
      currentCount: 12,
      baselineCount: 20,
      deltaCount: -8,
      deltaPercent: -40,
    });
    expect(summary?.summary).toContain('down 42.9%');

    const currentUrl = fetchMock.mock.calls[0]?.[0] as URL;
    const currentInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(currentUrl.pathname).toBe('/api/projects/12345/query/');
    expect(currentInit.headers).toMatchObject({
      Authorization: 'Bearer posthog-secret',
      'Content-Type': 'application/json',
    });
    expect(String(currentInit.body)).toContain('"kind":"HogQLQuery"');
    expect(String(currentInit.body)).toContain("event IN ('signup_completed', 'checkout_completed')");
  });

  it('returns undefined when disabled', async () => {
    const config = createTestConfig({ posthog: { enabled: false } });
    const fetchMock = vi.fn();
    const client = new PostHogImpactClient(config.posthog, fetchMock);

    await expect(client.summarizeProductImpact()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts the personal API key from request failures', async () => {
    const config = createTestConfig({ posthog: { enabled: true, personalApiKey: 'posthog-secret', projectId: '12345' } });
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401, statusText: 'posthog-secret rejected' }));
    const client = new PostHogImpactClient(config.posthog, fetchMock);

    await expect(client.summarizeProductImpact()).rejects.toThrow('[REDACTED]');
    try {
      await client.summarizeProductImpact();
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).not.toContain('posthog-secret');
    }
  });

  it('formats impact markdown for GitHub comments', () => {
    const markdown = formatProductImpactMarkdown({
      provider: 'posthog',
      windowStart: '2026-05-12T12:00:00.000Z',
      windowEnd: '2026-05-13T12:00:00.000Z',
      baselineStart: '2026-05-11T12:00:00.000Z',
      baselineEnd: '2026-05-12T12:00:00.000Z',
      totalCurrentCount: 16,
      totalBaselineCount: 28,
      totalCurrentActors: 14,
      totalBaselineActors: 25,
      totalDeltaCount: -12,
      totalDeltaPercent: -42.9,
      summary: '16 configured impact events observed, down 42.9% versus baseline.',
      impactEvents: [
        {
          event: 'signup_completed',
          currentCount: 12,
          currentActors: 10,
          baselineCount: 20,
          baselineActors: 18,
          deltaCount: -8,
          deltaPercent: -40,
        },
      ],
    });

    expect(markdown.join('\n')).toContain('## Product Impact');
    expect(markdown.join('\n')).toContain('| signup_completed | 12 | 20 | -8 (-40%) | 10 |');
  });
});
