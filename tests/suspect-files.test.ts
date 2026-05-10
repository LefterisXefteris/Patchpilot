import { describe, expect, it } from 'vitest';

import { formatSuspectFiles, mapSuspectFiles, normalizeSentryFilePath } from '../src/diagnosis/suspect-files.js';

describe('suspect file mapping', () => {
  it('normalizes common Sentry frame paths to repo-like source paths', () => {
    expect(normalizeSentryFilePath('webpack://app/src/main.tsx')).toBe('src/main.tsx');
    expect(normalizeSentryFilePath('/workspace/src/main.tsx')).toBe('src/main.tsx');
    expect(normalizeSentryFilePath('app:///src/main.tsx')).toBe('src/main.tsx');
    expect(normalizeSentryFilePath('/var/task/apps/web/src/app/page.tsx')).toBe('src/app/page.tsx');
  });

  it('filters vendor, framework, generated, and browser-extension frames', () => {
    expect(normalizeSentryFilePath('node_modules/react/index.js')).toBeUndefined();
    expect(normalizeSentryFilePath('chrome-extension://abc/content.js')).toBeUndefined();
    expect(normalizeSentryFilePath('/workspace/.next/static/chunks/framework-abc.js')).toBeUndefined();
    expect(normalizeSentryFilePath('https://cdn.example.com/app.js')).toBeUndefined();
  });

  it('ranks current stack files before memory-only files', () => {
    const mapping = mapSuspectFiles({
      event: {
        stack: [
          { filename: 'webpack://app/src/main.tsx', function: 'boot' },
          { filename: 'node_modules/react/index.js', function: 'render' },
        ],
      },
      memories: [
        {
          id: 'mem_1',
          title: 'Prior crash',
          environment: 'production',
          stackSignature: 'src/config/runtime.ts:readRuntimeConfig',
          fingerprint: 'abc',
          rootCauseSummary: 'runtime config missing',
          fixSummary: 'guard runtime config',
          outcome: 'recovered',
          confidence: 0.9,
          suspectFiles: [{ path: 'src/config/runtime.ts', score: 60, reason: 'stored memory', source: 'memory' }],
          primaryFile: 'src/config/runtime.ts',
          mappingConfidence: 0.6,
          labels: [],
          metadata: {},
        },
      ],
    });

    expect(mapping.primaryFile).toBe('src/main.tsx');
    expect(mapping.suspectFiles.map((file) => file.path)).toEqual(['src/main.tsx', 'src/config/runtime.ts']);
    expect(mapping.mappingConfidence).toBeGreaterThan(0.6);
  });

  it('boosts files present in both stack and memory', () => {
    const mapping = mapSuspectFiles({
      event: { stack: [{ filename: 'src/main.tsx', function: 'boot' }] },
      memories: [
        {
          id: 'mem_2',
          title: 'Prior boot crash',
          environment: 'production',
          stackSignature: 'src/main.tsx:boot',
          fingerprint: 'def',
          rootCauseSummary: 'boot crash',
          fixSummary: 'guard boot config',
          outcome: 'recovered',
          confidence: 0.9,
          suspectFiles: [{ path: 'src/main.tsx', score: 60, reason: 'stored memory', source: 'memory' }],
          primaryFile: 'src/main.tsx',
          mappingConfidence: 0.6,
          labels: [],
          metadata: {},
        },
      ],
    });

    expect(mapping.suspectFiles[0]).toMatchObject({ path: 'src/main.tsx', source: 'stack+memory' });
    expect(mapping.suspectFiles[0]?.reason).toContain('similar prior incident');
  });

  it('formats suspect files under a small budget', () => {
    const text = formatSuspectFiles(
      {
        primaryFile: 'src/main.tsx',
        mappingConfidence: 0.8,
        suspectFiles: [{ path: 'src/main.tsx', score: 80, reason: 'current Sentry stack frame in boot', source: 'stack' }],
      },
      140,
    );

    expect(text).toContain('Suspect files');
    expect(text).toContain('src/main.tsx');
    expect(text.length).toBeLessThanOrEqual(140);
  });
});
