import { describe, expect, it } from 'vitest';

import {
  loadConfig,
  loadConfigFromEnv,
  parseBoolean,
  parseCsv,
  parseGitHubRepositoryInput,
  parseNumber,
} from '../src/config/env.js';
import type { SecretStore } from '../src/secrets/types.js';
import { validEnv } from './test-helpers.js';

class RecordingSecretStore implements SecretStore {
  readonly requested: string[] = [];

  constructor(private readonly values: Record<string, string | undefined>) {}

  async get(name: string): Promise<string | undefined> {
    this.requested.push(name);
    return this.values[name];
  }

  async require(name: string): Promise<string> {
    this.requested.push(name);
    const value = this.values[name];
    if (!value) {
      throw new Error(`Missing required secret: ${name}`);
    }
    return value;
  }
}

describe('env config', () => {
  it('loads valid config', async () => {
    const config = await loadConfigFromEnv(validEnv);

    expect(config.sentry.orgSlug).toBe('acme');
    expect(config.github.privateKey).toBe('github-private-key');
    expect(config.github.repo).toBe('back-to-service');
    expect(config.github.targetRepo).toBe('web');
    expect(config.vercel.projectId).toBe('prj_123');
    expect(config.performance.enabled).toBe(true);
    expect(config.performance.allowedOps).toContain('db');
    expect(config.repair.provider).toBe('claude');
    expect(config.autopilot.allowRecoveryHook).toBe(true);
  });

  it('loads Codex as a repair provider', async () => {
    const config = await loadConfigFromEnv({ ...validEnv, BTS_REPAIR_PROVIDER: 'codex' });

    expect(config.repair.provider).toBe('codex');
  });

  it('reads secret fields through SecretStore', async () => {
    const store = new RecordingSecretStore(validEnv);

    await loadConfig(store, validEnv);

    expect(store.requested).toContain('SENTRY_AUTH_TOKEN');
    expect(store.requested).toContain('GITHUB_APP_PRIVATE_KEY');
    expect(store.requested).toContain('VERCEL_TOKEN');
  });

  it('reports missing required Sentry config', async () => {
    await expect(loadConfigFromEnv({ ...validEnv, SENTRY_ORG_SLUG: undefined })).rejects.toThrow('SENTRY_ORG_SLUG');
  });

  it('reports missing required GitHub config', async () => {
    await expect(loadConfigFromEnv({ ...validEnv, GITHUB_OWNER: undefined })).rejects.toThrow('GITHUB_OWNER');
  });

  it('reports missing required Vercel config', async () => {
    await expect(loadConfigFromEnv({ ...validEnv, VERCEL_PROJECT_ID: undefined })).rejects.toThrow('VERCEL_PROJECT_ID');
  });

  it('normalizes pasted GitHub repository URLs', async () => {
    const config = await loadConfigFromEnv({
      ...validEnv,
      GITHUB_TARGET_OWNER: 'ignored-when-repo-is-url',
      GITHUB_TARGET_REPO: 'https://github.com/LefterisXefteris/snapsyncai',
    });

    expect(config.github.targetOwner).toBe('LefterisXefteris');
    expect(config.github.targetRepo).toBe('snapsyncai');
  });

  it('parses primitive env values', () => {
    expect(parseBoolean('true', false)).toBe(true);
    expect(parseBoolean(undefined, true)).toBe(true);
    expect(parseNumber('42', 1)).toBe(42);
    expect(parseNumber('nope', 1)).toBe(1);
    expect(parseCsv('a, b,,c')).toEqual(['a', 'b', 'c']);
    expect(parseGitHubRepositoryInput('LefterisXefteris/snapsyncai.git')).toEqual({
      owner: 'LefterisXefteris',
      repo: 'snapsyncai',
    });
  });
});
