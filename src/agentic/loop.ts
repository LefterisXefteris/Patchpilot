import { randomUUID } from 'node:crypto';

import { selectWatchableGitHubIssues } from '../agent/github-issue-watcher.js';
import { isActionAllowed } from '../policy/autopilot-policy.js';
import type { AppConfig } from '../config/schema.js';
import { sentryIssueMarker } from '../agent/sync.js';
import type { GitHubIssueSummary } from '../providers/github/issues.js';
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

  const listResult = await callTool('github_list_sentry_incident_issues', { limit: 5 });
  const githubIssues = Array.isArray(listResult.output.issues) ? listResult.output.issues : [];
  const watchDecisions = selectWatchableGitHubIssues(githubIssues as unknown as GitHubIssueSummary[]);
  const acceptedIssue = watchDecisions.find((decision) => decision.accepted)?.issue;

  let decision: AgentDecision;
  if (!acceptedIssue) {
    decision = {
      action: 'ignore',
      confidence: 0.9,
      reason: watchDecisions[0]?.reason ?? 'No eligible Sentry-created GitHub incident issues were found.',
    };
  } else {
    decision = await runDecisionPath({ githubIssue: acceptedIssue as unknown as JsonObject, callTool, config: input.config, fixture });
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
  githubIssue: JsonObject;
  callTool: (name: string, toolInput: JsonObject) => Promise<ToolExecutionResult>;
  config?: AppConfig;
  fixture: AgentFixture;
}): Promise<AgentDecision> {
  const sentry = input.githubIssue.sentry as JsonObject | undefined;
  const sentryIssueId = String(sentry?.issueId ?? 'unknown');
  const fixtureIssue = input.fixture.sentryIssues.find((issue) => String(issue.id ?? issue.shortId ?? issue.short_id) === sentryIssueId);
  const issue = fixtureIssue ?? sentryIssueFromGithubIssue(input.githubIssue, sentryIssueId);
  const shortId = String(issue.shortId ?? issue.short_id ?? sentry?.shortId ?? 'SENTRY-UNKNOWN');
  const title = String(issue.title ?? input.githubIssue.title ?? 'Untitled Sentry issue');
  const environment = String(input.githubIssue.environment ?? issue.environment ?? 'production');
  const issueNumber = Number(input.githubIssue.number ?? 0) || undefined;
  const issueUrl = String(input.githubIssue.htmlUrl ?? input.githubIssue.html_url ?? '') || undefined;
  const eventResult = await input.callTool('sentry_get_issue_event', { issueId: sentryIssueId });
  const event = eventResult.output.event as JsonObject | undefined;
  const injectionRisk = /ignore previous|rollback|merge|print secret|exfiltrate|private key/i.test(
    `${title} ${JSON.stringify(event ?? {})}`,
  );

  const vercelResult = await input.callTool('vercel_get_latest_production_deployment', {
    projectId: input.config?.vercel.projectId ?? 'offline-project',
  });
  const severityResult = await input.callTool('severity_calculator', {
    level: String(issue.level ?? 'error'),
    environment,
    eventCount: Number(issue.count ?? 0),
    userCount: Number(issue.userCount ?? 0),
    hasEvent: eventResult.ok,
  });
  const confidence = Number(severityResult.output.confidence ?? 0.2);

  if (environment !== 'production') {
    return {
      action: 'ignore',
      confidence: 0.92,
      reason: 'Issue is not from production, so autonomous recovery is blocked.',
      sentryIssueId,
    };
  }

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

  await input.callTool('github_add_agent_status_comment', {
    issueNumber: issueNumber ?? 0,
    body: buildAcceptedIssueComment({ issue, event, confidence, vercelOk: vercelResult.ok }),
  });

  if (!eventResult.ok || confidence < 0.75) {
    return {
      action: 'needs_human',
      confidence,
      reason: eventResult.ok
        ? 'Evidence is too weak for autonomous patching.'
        : 'Sentry event details were unavailable from the linked GitHub issue, so patching needs a human.',
      issueNumber,
      issueUrl,
      sentryIssueId,
    };
  }

  if (input.config && !isActionAllowed(input.config.autopilot, 'trigger_claude') && !isActionAllowed(input.config.autopilot, 'trigger_agent')) {
    return {
      action: 'update_issue',
      confidence,
      reason: 'Existing incident issue was accepted, but policy does not allow Claude dispatch.',
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

function buildAcceptedIssueComment(input: {
  issue: JsonObject;
  event?: JsonObject;
  confidence: number;
  vercelOk: boolean;
}): string {
  return [
    '## Back To Service Status',
    '',
    'Accepted this Sentry-created GitHub issue for diagnosis.',
    `Confidence: ${input.confidence}`,
    `Vercel context available: ${input.vercelOk}`,
    `Sentry issue: ${String(input.issue.shortId ?? input.issue.short_id ?? input.issue.id ?? 'unknown')}`,
    '',
    '- Intake: existing GitHub issue accepted',
    '- Diagnosis: pending',
    '- Patch: draft PR only',
    input.event ? `- Evidence event id: ${String(input.event.id ?? 'unknown')}` : '- Evidence event: unavailable',
  ].join('\n');
}

function sentryIssueFromGithubIssue(githubIssue: JsonObject, sentryIssueId: string): JsonObject {
  const body = String(githubIssue.body ?? '');
  return {
    id: sentryIssueId,
    shortId: (githubIssue.sentry as JsonObject | undefined)?.shortId ?? sentryIssueId,
    title: String(githubIssue.title ?? 'Sentry-created GitHub issue'),
    level: body.match(/\bLevel:\s*\*{0,2}([A-Za-z0-9_-]+)\*{0,2}/i)?.[1] ?? 'error',
    count: Number(body.match(/\bEvents:\s*\*{0,2}(\d+)\*{0,2}/i)?.[1] ?? 5),
    userCount: Number(body.match(/\bUsers affected:\s*\*{0,2}(\d+)\*{0,2}/i)?.[1] ?? 1),
    environment: String(githubIssue.environment ?? 'production'),
  };
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
    githubIssues: [
      {
        number: 1,
        title: '[Sentry NODE-EXPRESS-3] Error: SENTRY_TEST_CRASH: intentional frontend boot failure',
        body: [
          sentryIssueMarker('offline-1'),
          '',
          'Sentry issue: NODE-EXPRESS-3',
          'Environment: production',
          'Events: 11',
          'Users affected: 1',
          'https://sentry.example/issues/offline-1',
        ].join('\n'),
        htmlUrl: 'https://github.example/issues/1',
        labels: ['sentry', 'production'],
      },
    ],
    vercelDeployment: { uid: 'dpl_offline', state: 'READY', target: 'production' },
  };
}
