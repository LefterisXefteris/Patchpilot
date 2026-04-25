import { describe, expect, it, vi } from 'vitest';

import { main } from '../src/index.js';

describe('validate-config CLI', () => {
  it('returns config_invalid for missing config', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['validate-config']);

    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('config_invalid'));
    log.mockRestore();
  });

  it('redacts secret-like values in config errors', async () => {
    const original = process.env.SENTRY_AUTH_TOKEN;
    process.env.SENTRY_AUTH_TOKEN = 'leaky-token';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['validate-config']);

    expect(code).toBe(1);
    const output = String(log.mock.calls[0]?.[0] ?? '');
    expect(output).toContain('config_invalid');
    expect(output).not.toContain('leaky-token');

    if (original === undefined) {
      delete process.env.SENTRY_AUTH_TOKEN;
    } else {
      process.env.SENTRY_AUTH_TOKEN = original;
    }
    log.mockRestore();
  });
});
