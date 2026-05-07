import { randomUUID } from 'node:crypto';

import { isActionAllowed } from '../policy/autopilot-policy.js';
import type { AppConfig } from '../config/schema.js';
import { sentryIssueMarker } from '../agent/sync.js';
import { SqliteStateStore } from '../state/sqlite-store.js';
import { estimateCostUsd, estimateTokens, logJson, redactJson } from './observability.js';
import { createIncidentTools, toolSchemas, type AgentTool, type ToolExecutionContext, type ToolExecutionResult } from './tools.js';
import type { AgentDecision, AgentFixture, AgentMetrics, AgentRunSummary, IncidentRunInput, JsonObject } from './types.js';

const DEFAULT_PROMPT_VARIANT = 'agent-system';

export async function runIncidentAgent(input: IncidentRunInput & { dbPath: string; dryRun?: boolean; config?: AppConfig }): Promise<AgentRunSummary> {
  const fixture = cloneFixture(input.fixture ?? defaultFixture());
  const promptVariant = input.promptVariant ?? DEFAULT_PROMPT_VARIANT;
  const tools = createIncidentTools();
  const store = new SqliteStateStore(input.dbPath);
  store.init();

  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const runId = `run_${randomUUID()}`;
  const incidentId = input.incidentId ?? `incident_${fixture.sentryIssues[0]?.id ?? randomUUID()}`;
  const selectedTools: string[] = [];
  const errors: string[] = [];
  let promptTokens = estimateTokens({ promptVariant, tools: toolSchemas(tools), fixtureName: fixture.name });
  let completionTokens = 0;

  store.upsertIncident({
    id: incidentId,
    sentryIssueId: String(fixture.sentryIssues[0]?.id ?? ''),
    status: 'running',
    data: redactJson({ fixtureName: fixture.name, issue: fixture.sentryIssues[0] ?? null }) as JsonObject,
  });
  store.createRun({
    id: runId,
    incidentId,
    status: 'running',
    promptVariant,
    data: { promptVariant, dryRun: input.dryRun ?? true },
  });

  logJson({ level: 'info', event: 'agent_run_started', runId, incidentId, promptVariant });

  const context: ToolExecutionContext = { fixture, dryRun: input.dryRun ?? true, config: input.config };
  const callTool = async (name: string, toolInput: JsonObject): Promise<ToolExecutionResult> => {
    const tool = requiredTool(tools, name);
    selectedTools.push(name);
    const before = Date.now();
    const result = await executeWithFallback(tool, toolInput, context);
    const latencyMs = Date.now() - before;
    const safeInput = redactJson(toolInput, secretsFromConfig(input.config)) as JsonObject;
    const safeOutput = redactJson(result.output, secretsFromConfig(input.config)) as JsonObject;

    promptTokens += estimateTokens(safeInput);
    completionTokens += estimateTokens(safeOutput);
    if (!result.ok && result.errorMessage) {
      errors.push(`${name}: ${result.errorCode ?? 'tool_error'}: ${result.errorMessage}`);
    }

    store.recordToolCall({
      runId,
      name,
      input: safeInput,
      output: safeOutput,
      ok: result.ok,
      latencyMs,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
    logJson({ level: result.ok ? 'info' : 'warn', event: 'tool_call', runId, name, ok: result.ok, latencyMs });
    return result;
  };

  const listResult = await callTool('sentry_list_issues', { limit: 5 });
  const issues = Array.isArray(listResult.output.issues) ? listResult.output.issues : [];
  const issue = issues[0] as JsonObject | undefined;

  let decision: AgentDecision;
  if (!issue) {
    decision = { action: 'ignore', confidence: 0.9, reason: 'No unresolved production Sentry issues were found.' };
  } else {
    decision = await runDecisionPath({ issue, callTool, config: input.config });
  }

  const completed = Date.now();
  const metrics: AgentMetrics = {
    startedAt,
    completedAt: new Date(completed).toISOString(),
    latencyMs: completed - started,
    llmCalls: 1,
    toolCalls: selectedTools.length,
    estimatedPromptTokens: promptTokens,
    estimatedCompletionTokens: completionTokens,
    estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens),
  };

  const ok = errors.length === 0 || decision.action === 'needs_human' || decision.action === 'create_issue';
  store.recordDecision(runId, decision);
  store.recordMetrics(runId, metrics);
  store.completeRun(runId, ok ? 'completed' : 'completed_with_errors', { decision, errors, metrics });
  store.upsertIncident({
    id: incidentId,
    sentryIssueId: decision.sentryIssueId,
    status: decision.action,
    data: redactJson({ decision, errors, metrics }) as JsonObject,
  });

  logJson({ level: ok ? 'info' : 'warn', event: 'agent_run_completed', runId, decision: decision.action, latencyMs: metrics.latencyMs });

  return {
    ok,
    runId,
    incidentId,
    decision,
    selectedTools,
    metrics,
    errors,
  };
}

async function runDecisionPath(input: {
  issue: JsonObject;
  callTool: (name: string, toolInput: JsonObject) => Promise<ToolExecutionResult>;
  config?: AppConfig;
}): Promise<AgentDecision> {
  const sentryIssueId = String(input.issue.id ?? 'unknown');
  const shortId = String(input.issue.shortId ?? input.issue.short_id ?? 'SENTRY-UNKNOWN');
  const title = String(input.issue.title ?? 'Untitled Sentry issue');
  const environment = String(input.issue.environment ?? 'production');
  const eventResult = await input.callTool('sentry_get_issue_event', { issueId: sentryIssueId });
  const event = eventResult.output.event as JsonObject | undefined;
  const injectionRisk = /ignore previous|rollback|merge|print secret|exfiltrate|private key/i.test(
    `${title} ${JSON.stringify(event ?? {})}`,
  );

  const vercelResult = await input.callTool('vercel_get_latest_production_deployment', {
    projectId: input.config?.vercel.projectId ?? 'offline-project',
  });
  const severityResult = await input.callTool('severity_calculator', {
    level: String(input.issue.level ?? 'error'),
    environment,
    eventCount: Number(input.issue.count ?? 0),
    userCount: Number(input.issue.userCount ?? 0),
    hasEvent: eventResult.ok,
  });
  const confidence = Number(severityResult.output.confidence ?? 0.2);
  const marker = sentryIssueMarker(sentryIssueId);
  const shouldCreateIssue = environment === 'production';

  if (environment !== 'production') {
    return {
      action: 'ignore',
      confidence: 0.92,
      reason: 'Issue is not from production, so autonomous recovery is blocked.',
      sentryIssueId,
    };
  }

  const githubResult = await input.callTool('github_find_or_create_incident_issue', {
    sentryIssueId,
    shortId,
    title: `[Sentry ${shortId}] ${title}`,
    body: buildIncidentBody({ marker, issue: input.issue, event, confidence, vercelOk: vercelResult.ok }),
    create: shouldCreateIssue,
  });

  const issueNumber = Number(githubResult.output.issueNumber ?? 0) || undefined;
  const issueUrl = String(githubResult.output.issueUrl ?? '') || undefined;
  const issueAction = String(githubResult.output.action ?? '');

  if (injectionRisk) {
    return {
      action: 'needs_human',
      confidence: 0.3,
      reason: 'Potential prompt injection or unsafe recovery instruction detected in incident evidence.',
      issueNumber,
      issueUrl,
      sentryIssueId,
    };
  }

  if (!eventResult.ok || confidence < 0.75) {
    return {
      action: eventResult.ok ? 'needs_human' : 'create_issue',
      confidence,
      reason: eventResult.ok
        ? 'Evidence is too weak for autonomous patching.'
        : 'Sentry event details were unavailable, so the incident was recorded but patching needs a human.',
      issueNumber,
      issueUrl,
      sentryIssueId,
    };
  }

  if (issueAction === 'found_issue') {
    return {
      action: 'update_issue',
      confidence,
      reason: 'Existing GitHub incident issue found and updated with fresh evidence.',
      issueNumber,
      issueUrl,
      sentryIssueId,
    };
  }

  if (input.config && !isActionAllowed(input.config.autopilot, 'trigger_claude') && !isActionAllowed(input.config.autopilot, 'trigger_agent')) {
    return {
      action: 'create_issue',
      confidence,
      reason: 'Incident issue was created, but policy does not allow Claude dispatch.',
      issueNumber,
      issueUrl,
      sentryIssueId,
    };
  }

  const dispatchResult = await input.callTool('github_repository_dispatch_claude', {
    sentryIssueId,
    shortId,
    issueNumber: issueNumber ?? 0,
    issueUrl: issueUrl ?? '',
    title,
  });

  return {
    action: 'trigger_claude',
    confidence,
    reason: 'High-confidence production incident with enough evidence; Claude draft-PR worker was triggered.',
    issueNumber,
    issueUrl,
    sentryIssueId,
    triggeredClaude: Boolean(dispatchResult.output.dispatched),
  };
}

function buildIncidentBody(input: {
  marker: string;
  issue: JsonObject;
  event?: JsonObject;
  confidence: number;
  vercelOk: boolean;
}): string {
  return [
    input.marker,
    '',
    '## Production Error',
    '',
    `Sentry issue: ${String(input.issue.shortId ?? input.issue.short_id ?? 'unknown')}`,
    `Title: ${String(input.issue.title ?? 'unknown')}`,
    `Environment: ${String(input.issue.environment ?? 'unknown')}`,
    `Events: ${String(input.issue.count ?? 'unknown')}`,
    `Users affected: ${String(input.issue.userCount ?? 0)}`,
    `Confidence: ${input.confidence}`,
    `Vercel context available: ${input.vercelOk}`,
    '',
    '## Agent Status',
    '',
    '- Intake: detected',
    '- Diagnosis: pending',
    '- Patch: draft PR only',
    input.event ? `- Evidence event id: ${String(input.event.id ?? 'unknown')}` : '- Evidence event: unavailable',
  ].join('\n');
}

async function executeWithFallback(tool: AgentTool, input: JsonObject, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const attempts = 2;
  let last: ToolExecutionResult | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      last = await withTimeout(tool.execute(input, context), 5_000);
      if (last.ok || !isRetryable(last.errorCode)) {
        return last;
      }
    } catch (error) {
      last = {
        ok: false,
        output: {},
        errorCode: 'tool_exception',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return last ?? { ok: false, output: {}, errorCode: 'tool_failed', errorMessage: 'Tool failed without output' };
}

function isRetryable(errorCode: string | undefined): boolean {
  return errorCode === 'vercel_request_failed' || errorCode === 'tool_exception';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function requiredTool(tools: AgentTool[], name: string): AgentTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool;
}

function cloneFixture(fixture: AgentFixture): AgentFixture {
  return JSON.parse(JSON.stringify(fixture)) as AgentFixture;
}

function secretsFromConfig(config: AppConfig | undefined): Array<string | undefined> {
  return [config?.sentry.authToken, config?.sentry.webhookSecret, config?.github.privateKey, config?.github.webhookSecret, config?.vercel.token];
}

function defaultFixture(): AgentFixture {
  return {
    name: 'default-production-crash',
    sentryIssues: [
      {
        id: 'offline-1',
        shortId: 'NODE-EXPRESS-3',
        title: 'Error: SENTRY_TEST_CRASH: intentional frontend boot failure',
        level: 'error',
        count: 11,
        userCount: 1,
        environment: 'production',
      },
    ],
    sentryEvents: {
      'offline-1': {
        id: 'event-1',
        stack: [{ filename: 'src/main.tsx', function: 'boot' }],
      },
    },
    githubIssues: [],
    vercelDeployment: { uid: 'dpl_offline', state: 'READY', target: 'production' },
  };
}
