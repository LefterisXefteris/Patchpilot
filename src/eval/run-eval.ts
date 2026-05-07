import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runIncidentAgent } from '../agentic/loop.js';
import { SqliteStateStore } from '../state/sqlite-store.js';
import type { EvalScenarioResult } from '../agentic/types.js';
import { evalScenarios } from './scenarios.js';

export type EvalOptions = {
  dbPath?: string;
  promptVariant?: string;
};

export type EvalSummary = {
  ok: boolean;
  promptVariant: string;
  scenarioCount: number;
  passedCount: number;
  results: EvalScenarioResult[];
};

export async function runEvalHarness(options: EvalOptions = {}): Promise<EvalSummary> {
  const dbPath = options.dbPath ?? join(mkdtempSync(join(tmpdir(), 'back-to-service-eval-')), 'eval.sqlite');
  const promptVariant = options.promptVariant ?? 'agent-system';
  const store = new SqliteStateStore(dbPath);
  store.init();
  const results: EvalScenarioResult[] = [];

  for (const scenario of evalScenarios) {
    const summary = await runIncidentAgent({
      dbPath,
      fixture: scenario.fixture,
      incidentId: `eval_${scenario.id}`,
      promptVariant,
      dryRun: true,
    });
    const missingTool = scenario.expectedTools?.find((toolName) => !summary.selectedTools.includes(toolName));
    const traceText = safeRead(dbPath);
    const leakedSecret = scenario.mustRedact?.find((secret) => traceText.includes(secret));
    const passed = summary.decision.action === scenario.expectedAction && !missingTool && !leakedSecret;
    const failureReason =
      summary.decision.action !== scenario.expectedAction
        ? `Expected ${scenario.expectedAction}, got ${summary.decision.action}`
        : missingTool
          ? `Expected tool ${missingTool} was not selected`
          : leakedSecret
            ? `Secret value leaked into SQLite trace: ${leakedSecret}`
            : undefined;

    const result: EvalScenarioResult = {
      id: scenario.id,
      passed,
      selectedTools: summary.selectedTools,
      finalDecision: summary.decision.action,
      latencyMs: summary.metrics.latencyMs,
      estimatedCostUsd: summary.metrics.estimatedCostUsd,
      failureReason,
    };
    results.push(result);
    store.recordEval({
      scenarioId: scenario.id,
      runId: summary.runId,
      passed,
      finalDecision: summary.decision.action,
      failureReason,
      metrics: summary.metrics,
    });
  }

  const passedCount = results.filter((result) => result.passed).length;
  return {
    ok: passedCount === results.length,
    promptVariant,
    scenarioCount: results.length,
    passedCount,
    results,
  };
}

export async function runPromptAblation(options: EvalOptions = {}): Promise<EvalSummary[]> {
  const variants = ['agent-system', 'agent-system-minimal', 'agent-system-no-tool-rules'];
  const root = mkdtempSync(join(tmpdir(), 'back-to-service-ablation-'));
  const summaries: EvalSummary[] = [];

  for (const variant of variants) {
    summaries.push(await runEvalHarness({ ...options, dbPath: join(root, `${variant}.sqlite`), promptVariant: variant }));
  }

  return summaries;
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

