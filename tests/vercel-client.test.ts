import { describe, expect, it } from 'vitest';

import { loadConfigFromEnv } from '../src/config/env.js';
import { VercelClient } from '../src/providers/vercel/client.js';
import { validEnv } from './test-helpers.js';

async function vercelConfig() {
  return (await loadConfigFromEnv(validEnv)).vercel;
}

describe('VercelClient', () => {
  it('validates production deployment metadata access', async () => {
    const client = new VercelClient(await vercelConfig(), {
      listDeployments: async () => ({
        deployments: [{ uid: 'dpl_1', state: 'READY', target: 'production' }],
      }),
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(true);
    expect(result.details.latestDeploymentState).toBe('READY');
    expect(result.details.teamSlugUsedForApi).toBe(false);
  });

  it('treats an empty deployment list as readable access', async () => {
    const client = new VercelClient(await vercelConfig(), {
      listDeployments: async () => ({ deployments: [] }),
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(true);
    expect(result.details.deploymentVisible).toBe(false);
  });

  it('redacts unauthorized errors', async () => {
    const config = await vercelConfig();
    const client = new VercelClient(config, {
      listDeployments: async () => {
        throw new Error(`unauthorized ${config.token}`);
      },
    });

    const result = await client.validateAccess();

    expect(result.errorCode).toBe('vercel_request_failed');
    expect(result.errorMessage).toContain('[REDACTED]');
    expect(result.errorMessage).not.toContain(config.token);
  });

  it('does not expose mutation methods', async () => {
    const client = new VercelClient(await vercelConfig(), {
      listDeployments: async () => ({ deployments: [] }),
    });

    expect('rollback' in client).toBe(false);
    expect('redeploy' in client).toBe(false);
    expect('promote' in client).toBe(false);
  });
});
