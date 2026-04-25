import { describe, expect, it } from 'vitest';

import { validateIntegrations } from '../src/validation/validate-integrations.js';
import { loadConfigFromEnv } from '../src/config/env.js';
import { validEnv } from './test-helpers.js';

describe('validateIntegrations', () => {
  it('returns ok false when real provider validation cannot pass', async () => {
    const summary = await validateIntegrations(await loadConfigFromEnv(validEnv));

    expect(summary.ok).toBe(false);
    expect(summary.results).toHaveLength(3);
  });
});
