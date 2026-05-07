import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { AgentDecision, AgentMetrics, JsonValue } from '../agentic/types.js';

export type ToolCallRecord = {
  runId: string;
  name: string;
  input: JsonValue;
  output?: JsonValue;
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
};

export type EvalRecord = {
  scenarioId: string;
  runId: string;
  passed: boolean;
  finalDecision: string;
  failureReason?: string;
  metrics: AgentMetrics;
};

export class SqliteStateStore {
  constructor(private readonly dbPath: string) {}

  init(): void {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.exec(`
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        sentry_issue_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt_variant TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        data_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        name TEXT NOT NULL,
        ok INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        action TEXT NOT NULL,
        confidence REAL NOT NULL,
        decision_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        llm_calls INTEGER NOT NULL,
        tool_calls INTEGER NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        metrics_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS eval_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        passed INTEGER NOT NULL,
        final_decision TEXT NOT NULL,
        failure_reason TEXT,
        metrics_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  upsertIncident(input: { id: string; sentryIssueId?: string; status: string; data: JsonValue }): void {
    const now = new Date().toISOString();
    this.exec(`
      INSERT INTO incidents (id, sentry_issue_id, status, created_at, updated_at, data_json)
      VALUES (${q(input.id)}, ${q(input.sentryIssueId)}, ${q(input.status)}, ${q(now)}, ${q(now)}, ${q(input.data)})
      ON CONFLICT(id) DO UPDATE SET
        sentry_issue_id = excluded.sentry_issue_id,
        status = excluded.status,
        updated_at = excluded.updated_at,
        data_json = excluded.data_json;
    `);
  }

  createRun(input: { id: string; incidentId: string; status: string; promptVariant: string; data: JsonValue }): void {
    const now = new Date().toISOString();
    this.exec(`
      INSERT INTO runs (id, incident_id, status, prompt_variant, started_at, data_json)
      VALUES (${q(input.id)}, ${q(input.incidentId)}, ${q(input.status)}, ${q(input.promptVariant)}, ${q(now)}, ${q(input.data)});
    `);
  }

  completeRun(runId: string, status: string, data: JsonValue): void {
    const now = new Date().toISOString();
    this.exec(`
      UPDATE runs
      SET status = ${q(status)}, completed_at = ${q(now)}, data_json = ${q(data)}
      WHERE id = ${q(runId)};
    `);
  }

  recordToolCall(record: ToolCallRecord): void {
    this.exec(`
      INSERT INTO tool_calls
        (run_id, name, ok, latency_ms, input_json, output_json, error_code, error_message, created_at)
      VALUES
        (${q(record.runId)}, ${q(record.name)}, ${record.ok ? 1 : 0}, ${record.latencyMs},
         ${q(record.input)}, ${q(record.output ?? null)}, ${q(record.errorCode)}, ${q(record.errorMessage)}, ${q(new Date().toISOString())});
    `);
  }

  recordDecision(runId: string, decision: AgentDecision): void {
    this.exec(`
      INSERT INTO decisions (run_id, action, confidence, decision_json, created_at)
      VALUES (${q(runId)}, ${q(decision.action)}, ${decision.confidence}, ${q(decision)}, ${q(new Date().toISOString())});
    `);
  }

  recordMetrics(runId: string, metrics: AgentMetrics): void {
    this.exec(`
      INSERT INTO metrics
        (run_id, latency_ms, llm_calls, tool_calls, prompt_tokens, completion_tokens, estimated_cost_usd, metrics_json, created_at)
      VALUES
        (${q(runId)}, ${metrics.latencyMs}, ${metrics.llmCalls}, ${metrics.toolCalls},
         ${metrics.estimatedPromptTokens}, ${metrics.estimatedCompletionTokens}, ${metrics.estimatedCostUsd},
         ${q(metrics)}, ${q(new Date().toISOString())});
    `);
  }

  recordEval(record: EvalRecord): void {
    this.exec(`
      INSERT INTO eval_results
        (scenario_id, run_id, passed, final_decision, failure_reason, metrics_json, created_at)
      VALUES
        (${q(record.scenarioId)}, ${q(record.runId)}, ${record.passed ? 1 : 0}, ${q(record.finalDecision)},
         ${q(record.failureReason)}, ${q(record.metrics)}, ${q(new Date().toISOString())});
    `);
  }

  private exec(sql: string): void {
    execFileSync('sqlite3', [this.dbPath, sql], { stdio: 'pipe' });
  }
}

function q(value: unknown): string {
  if (value === undefined) {
    return 'NULL';
  }

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${serialized.replaceAll("'", "''")}'`;
}
