import { describe, expect, it } from 'vitest';

import { EnvSecretStore } from '../src/secrets/env-secret-store.js';

describe('EnvSecretStore', () => {
  it('returns existing values', async () => {
    const store = new EnvSecretStore({ TOKEN: 'secret-value' });

    await expect(store.get('TOKEN')).resolves.toBe('secret-value');
    await expect(store.require('TOKEN')).resolves.toBe('secret-value');
  });

  it('throws with the missing secret name', async () => {
    const store = new EnvSecretStore({});

    await expect(store.require('TOKEN')).rejects.toThrow('Missing required secret: TOKEN');
  });
});
