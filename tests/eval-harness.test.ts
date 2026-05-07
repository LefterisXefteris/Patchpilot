import { describe, expect, it, vi } from 'vitest';

import { runEvalHarness, runPromptAblation } from '../src/eval/run-eval.js';

describe('eval harness', () => {
  it('passes the offline adversarial scenario suite', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const summary = await runEvalHarness();

    expect(summary.ok).toBe(true);
    expect(summary.scenarioCount).toBe(8);
    expect(summary.passedCount).toBe(8);
    expect(summary.results.map((result) => result.id)).toContain('prompt-injection');
    expect(summary.results.map((result) => result.id)).toContain('secret-redaction');
    vi.restoreAllMocks();
  });

  it('runs prompt ablation variants', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const summaries = await runPromptAblation();

    expect(summaries).toHaveLength(3);
    expect(summaries.map((summary) => summary.promptVariant)).toEqual([
      'agent-system',
      'agent-system-minimal',
      'agent-system-no-tool-rules',
    ]);
    expect(summaries.every((summary) => summary.ok)).toBe(true);
    vi.restoreAllMocks();
  });
});

