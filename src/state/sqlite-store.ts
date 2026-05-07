import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { AgentDecision, AgentMetrics, JsonValue } from '../agentic/types.js';
import type { RecoveryAttemptRecord } from '../recovery/types.js';
import type { VerificationResult } from '../verification/types.js';

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
      CREATE TABLE IF NOT EXISTS recovery_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id TEXT NOT NULL,
        sentry_issue_id TEXT,
        attempt_number INTEGER NOT NULL,
        verdict TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        partial_streak INTEGER NOT NULL DEFAULT 0,
        verification_json TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recovery_attempts_incident
        ON recovery_attempts (incident_id, id);
    `);
  }

  recordRecoveryAttempt(record: RecoveryAttemptRecord, verification: VerificationResult): void {
    this.exec(`
      INSERT INTO recovery_attempts
        (incident_id, sentry_issue_id, attempt_number, verdict, action, reason, partial_streak, verification_json, verified_at, created_at)
      VALUES
        (${q(record.incidentId)}, ${q(record.sentryIssueId)}, ${record.attemptNumber}, ${q(record.verdict)}, ${q(record.action)},
         ${q(record.reason)}, ${record.partialStreak}, ${q(verification as unknown as JsonValue)}, ${q(record.verifiedAt)}, ${q(new Date().toISOString())});
    `);
  }

  getLatestRecoveryAttempt(incidentId: string): RecoveryAttemptRecord | undefined {
    const sql = `SELECT incident_id, sentry_issue_id, attempt_number, verdict, action, reason, partial_streak, verified_at
      FROM recovery_attempts WHERE incident_id = ${q(incidentId)} ORDER BY id DESC LIMIT 1;`;
    const out = execFileSync('sqlite3', ['-separator', '\t', this.dbPath, sql], { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
    if (!out) {
      return undefined;
    }
    const cols = out.split('\t');
    if (cols.length < 8) {
      return undefined;
    }
    return {
      incidentId: cols[0] ?? '',
      sentryIssueId: cols[1] || undefined,
      attemptNumber: Number(cols[2] ?? 0),
      verdict: (cols[3] ?? 'needs_human') as RecoveryAttemptRecord['verdict'],
      action: (cols[4] ?? 'wait') as RecoveryAttemptRecord['action'],
      reason: cols[5] ?? '',
      partialStreak: Number(cols[6] ?? 0),
      verifiedAt: cols[7] ?? new Date().toISOString(),
    };
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
