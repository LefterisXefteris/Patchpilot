import { describe, expect, it, vi } from 'vitest';

import { loadConfigFromEnv } from '../src/config/env.js';
import { GitHubIssueSyncClient } from '../src/providers/github/issues.js';
import { validEnv } from './test-helpers.js';

describe('GitHubIssueSyncClient', () => {
  it('syncs issues to the configured target service repository', async () => {
    const config = (await loadConfigFromEnv(validEnv)).github;
    const listOpenIssues = vi.fn(async () => []);
    const createIssue = vi.fn(async () => ({ number: 12, title: 'Created' }));
    const createIssueComment = vi.fn(async () => undefined);
    const createRepositoryDispatch = vi.fn(async () => undefined);
    const client = new GitHubIssueSyncClient(config, {
      createInstallationToken: async () => 'installation-token',
      listOpenIssues,
      createIssue,
      createIssueComment,
      createRepositoryDispatch,
    });

    await client.findIssueByMarker('<!-- marker -->');
    await client.createIssue({ title: 'Incident', body: 'Body' });
    await client.addIssueComment(12, 'Still failing');
    await client.createRepositoryDispatch('back-to-service.incident', { sentryIssueId: '123' });

    expect(client.targetRepository()).toEqual({
      owner: 'acme',
      repo: 'web',
      installationId: '789',
    });
    expect(listOpenIssues).toHaveBeenCalledWith('installation-token', 'acme', 'web');
    expect(createIssue).toHaveBeenCalledWith('installation-token', 'acme', 'web', {
      title: 'Incident',
      body: 'Body',
    });
    expect(createIssueComment).toHaveBeenCalledWith('installation-token', 'acme', 'web', 12, 'Still failing');
    expect(createRepositoryDispatch).toHaveBeenCalledWith('installation-token', 'acme', 'web', 'back-to-service.incident', {
      sentryIssueId: '123',
    });
  });

  it('falls back to the agent repository when used outside agent:sync', async () => {
    const config = (
      await loadConfigFromEnv({
        ...validEnv,
        GITHUB_TARGET_INSTALLATION_ID: '',
        GITHUB_TARGET_OWNER: '',
        GITHUB_TARGET_REPO: '',
      })
    ).github;

    expect(new GitHubIssueSyncClient(config).targetRepository()).toEqual({
      owner: 'acme',
      repo: 'back-to-service',
      installationId: '456',
    });
  });
});
