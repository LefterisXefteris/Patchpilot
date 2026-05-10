import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildStackSignature, formatIncidentMemories } from '../src/memory/incident-memory.js';
import { SqliteStateStore } from '../src/state/sqlite-store.js';

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), 'bts-memory-test-')), 'state.sqlite');
}

describe('incident memory', () => {
  it('creates incident_memory during SQLite init', () => {
    const dbPath = tempDb();
    new SqliteStateStore(dbPath).init();

    const tables = execFileSync('sqlite3', [dbPath, ".tables incident_memory"]).toString();

    expect(tables).toContain('incident_memory');
  });

  it('builds compact stack signatures from Sentry event frames', () => {
    expect(
      buildStackSignature({
        stack: [
          { filename: '/workspace/src/main.tsx', function: 'boot' },
          { filename: '/workspace/src/config/runtime.ts', function: 'readRuntimeConfig' },
        ],
      }),
    ).toBe('workspace/src/main.tsx:boot > src/config/runtime.ts:readRuntimeConfig');
  });

  it('records redacted memories and retrieves similar incidents by stack and title', () => {
    const dbPath = tempDb();
    const store = new SqliteStateStore(dbPath);
    store.init();

    store.recordIncidentMemory(
      {
        sentryIssueId: 'old-1',
        githubIssueNumber: 7,
        githubIssueUrl: 'https://github.example/issues/7',
        title: 'TypeError: Cannot read properties of undefined sntrys_should_not_escape',
        environment: 'production',
        event: { stack: [{ filename: 'src/main.tsx', function: 'boot' }] },
        rootCauseSummary: 'runtimeConfig was undefined with token sntrys_should_not_escape',
        fixSummary: 'Guard runtimeConfig access and use fallback version vcp_should_not_escape',
        outcome: 'recovered',
        confidence: 0.91,
        labels: ['sentry', 'production'],
        metadata: { authorization: 'Bearer sntrys_should_not_escape' },
      },
      ['sntrys_should_not_escape', 'vcp_should_not_escape'],
    );

    const matches = store.findSimilarIncidentMemories({
      sentryIssueId: 'new-1',
      title: 'Cannot read properties of undefined during boot',
      environment: 'production',
      event: { stack: [{ filename: 'src/main.tsx', function: 'boot' }] },
    });
    const dump = execFileSync('sqlite3', [dbPath, '.dump incident_memory']).toString();

    expect(matches).toHaveLength(1);
    expect(matches[0]?.rootCauseSummary).toContain('[REDACTED]');
    expect(dump).not.toContain('sntrys_should_not_escape');
    expect(dump).not.toContain('vcp_should_not_escape');
  });

  it('formats prior memories under a strict character budget', () => {
    const formatted = formatIncidentMemories(
      [
        {
          id: 'mem_1',
          sentryIssueId: '1',
          title: 'Frontend boot crash',
          environment: 'production',
          stackSignature: 'src/main.tsx:boot',
          fingerprint: 'abc',
          rootCauseSummary: 'Runtime config was missing during boot.',
          fixSummary: 'Guard config access and add fallback values.',
          outcome: 'recovered',
          confidence: 0.91,
          suspectFiles: [{ path: 'src/main.tsx', score: 80, reason: 'current Sentry stack frame', source: 'stack' }],
          primaryFile: 'src/main.tsx',
          mappingConfidence: 0.8,
          labels: [],
          metadata: {},
        },
      ],
      180,
    );

    expect(formatted).toContain('Relevant prior incidents');
    expect(formatted).toContain('advisory only');
    expect(formatted.length).toBeLessThanOrEqual(180);
  });
});
