import { describe, it, expect } from 'vitest';
import { checkVercelDeployment, type DeployCheckDependencies } from '../src/verification/deploy-check.js';
import { createTestConfig } from './test-helpers.js';

function mockDeps(state: string, uid = 'dpl_test'): DeployCheckDependencies {
  return {
    listDeployments: async () => ({
      deployments: [{ uid, state, target: 'production', createdAt: Date.now() }],
    }),
  };
}

function emptyDeps(): DeployCheckDependencies {
  return { listDeployments: async () => ({ deployments: [] }) };
}

function failingDeps(error: string): DeployCheckDependencies {
  return { listDeployments: async () => { throw new Error(error); } };
}

describe('checkVercelDeployment', () => {
  it('returns pass for READY deployment', async () => {
    const config = createTestConfig();
    const result = await checkVercelDeployment(config, mockDeps('READY'));
    expect(result.status).toBe('pass');
    expect(result.message).toContain('READY');
  });

  it('returns fail for ERROR deployment', async () => {
    const config = createTestConfig();
    const result = await checkVercelDeployment(config, mockDeps('ERROR'));
    expect(result.status).toBe('fail');
  });

  it('returns degraded for BUILDING deployment', async () => {
    const config = createTestConfig();
    const result = await checkVercelDeployment(config, mockDeps('BUILDING'));
    expect(result.status).toBe('degraded');
  });

  it('returns fail when no deployments found', async () => {
    const config = createTestConfig();
    const result = await checkVercelDeployment(config, emptyDeps());
    expect(result.status).toBe('fail');
    expect(result.message).toContain('No production deployments');
  });

  it('returns fail on API error', async () => {
    const config = createTestConfig();
    const result = await checkVercelDeployment(config, failingDeps('timeout'));
    expect(result.status).toBe('fail');
    expect(result.message).toContain('timeout');
  });

  it('uses target vercel project ID when configured', async () => {
    let capturedProjectId = '';
    const deps: DeployCheckDependencies = {
      listDeployments: async ({ projectId }) => {
        capturedProjectId = projectId;
        return { deployments: [{ uid: 'dpl_1', state: 'READY' }] };
      },
    };
    const config = createTestConfig({ target: { vercelProjectId: 'prj_TARGET' } });
    await checkVercelDeployment(config, deps);
    expect(capturedProjectId).toBe('prj_TARGET');
  });
});
