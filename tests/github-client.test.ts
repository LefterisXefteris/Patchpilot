import { describe, expect, it } from 'vitest';

import { loadConfigFromEnv } from '../src/config/env.js';
import { GitHubClient } from '../src/providers/github/client.js';
import { validEnv } from './test-helpers.js';

async function githubConfig() {
  return (await loadConfigFromEnv(validEnv)).github;
}

describe('GitHubClient', () => {
  it('validates repository access', async () => {
    const client = new GitHubClient(await githubConfig(), {
      createInstallationToken: async () => 'installation-token',
      getRepository: async () => ({
        id: 1,
        full_name: 'acme/web',
        private: true,
        permissions: { metadata: true },
      }),
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(true);
    expect(result.details.metadataPermission).toBe(true);
  });

  it('reports missing metadata permission', async () => {
    const client = new GitHubClient(await githubConfig(), {
      createInstallationToken: async () => 'installation-token',
      getRepository: async () => ({
        id: 1,
        full_name: 'acme/web',
        private: true,
        permissions: { metadata: false },
      }),
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('github_missing_permissions');
    expect(result.missingScopes).toEqual(['metadata']);
  });

  it('allows absent permission details', async () => {
    const client = new GitHubClient(await githubConfig(), {
      createInstallationToken: async () => 'installation-token',
      getRepository: async () => ({
        id: 1,
        full_name: 'acme/web',
        private: true,
      }),
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(true);
  });

  it('redacts request errors', async () => {
    const config = await githubConfig();
    const client = new GitHubClient(config, {
      createInstallationToken: async () => {
        throw new Error(`bad ${config.privateKey}`);
      },
      getRepository: async () => {
        throw new Error('unreachable');
      },
    });

    const result = await client.validateAccess();

    expect(result.errorCode).toBe('github_request_failed');
    expect(result.errorMessage).toContain('[REDACTED]');
    expect(result.errorMessage).not.toContain(config.privateKey);
  });

  it('does not expose mutation methods', async () => {
    const client = new GitHubClient(await githubConfig(), {
      createInstallationToken: async () => 'installation-token',
      getRepository: async () => ({
        id: 1,
        full_name: 'acme/web',
        private: true,
        permissions: { metadata: true },
      }),
    });

    expect('createIssue' in client).toBe(false);
    expect('createBranch' in client).toBe(false);
    expect('openPullRequest' in client).toBe(false);
    expect('mergePullRequest' in client).toBe(false);
  });
});
