import { describe, expect, it, vi } from 'vitest';

import { loadConfigFromEnv } from '../src/config/env.js';
import { GitHubClient } from '../src/providers/github/client.js';
import { validEnv } from './test-helpers.js';

async function githubConfig() {
  return (await loadConfigFromEnv(validEnv)).github;
}

describe('GitHubClient', () => {
  it('validates repository access', async () => {
    const getRepository = vi.fn(async () => ({
      id: 1,
      full_name: 'acme/web',
      private: true,
      permissions: { metadata: true },
    }));
    const client = new GitHubClient(await githubConfig(), {
      createInstallationToken: async () => 'installation-token',
      getRepository,
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(true);
    expect(getRepository).toHaveBeenCalledWith('installation-token', 'acme', 'web');
    expect(result.details.agentRepo).toBe('back-to-service');
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

  it('allows permission details that omit metadata after repository fetch succeeds', async () => {
    const client = new GitHubClient(await githubConfig(), {
      createInstallationToken: async () => 'installation-token',
      getRepository: async () => ({
        id: 1,
        full_name: 'acme/web',
        private: true,
        permissions: { pull: true, push: false },
      }),
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(true);
    expect(result.missingScopes).toBeUndefined();
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

  it('requires an explicit target repository for validation', async () => {
    const config = await loadConfigFromEnv({
      ...validEnv,
      GITHUB_TARGET_OWNER: '',
      GITHUB_TARGET_REPO: '',
    });
    const client = new GitHubClient(config.github, {
      createInstallationToken: vi.fn(async () => 'installation-token'),
      getRepository: vi.fn(),
    });

    const result = await client.validateAccess();

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('github_target_repository_missing');
    expect(result.missingScopes).toEqual(['target_repository']);
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
