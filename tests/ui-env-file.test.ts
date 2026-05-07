import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readEnvFile, writeEnvFile } from '../src/ui/env-file.js';

describe('ui env file helpers', () => {
  it('writes and reads multiline secrets safely', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bts-ui-env-')), '.env');

    writeEnvFile(
      {
        SENTRY_ORG_SLUG: 'tribeagent',
        GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
        ANTHROPIC_API_KEY: 'sk-ant-test',
        AUTOPILOT_ENABLED: 'true',
      },
      path,
    );

    expect(readEnvFile(path)).toMatchObject({
      SENTRY_ORG_SLUG: 'tribeagent',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      AUTOPILOT_ENABLED: 'true',
    });
    expect(readFileSync(path, 'utf8')).toContain('GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----"');
  });
});
