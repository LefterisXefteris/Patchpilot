import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadDotenvFile } from '../src/config/dotenv.js';

describe('loadDotenvFile', () => {
  const keys = ['BTS_DOTENV_TEST'];

  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it('loads local env values without overriding existing env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bts-env-'));
    const envFile = join(dir, '.env');
    writeFileSync(envFile, 'BTS_DOTENV_TEST=from-file\n');

    loadDotenvFile(envFile);

    expect(process.env.BTS_DOTENV_TEST).toBe('from-file');
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not override existing env values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bts-env-'));
    const envFile = join(dir, '.env');
    writeFileSync(envFile, 'BTS_DOTENV_TEST=from-file\n');
    process.env.BTS_DOTENV_TEST = 'from-shell';

    loadDotenvFile(envFile);

    expect(process.env.BTS_DOTENV_TEST).toBe('from-shell');
    rmSync(dir, { recursive: true, force: true });
  });
});
