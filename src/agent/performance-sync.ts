import { assertTargetRepositoryConfigured, repairDispatchEvent, repairWorkerName } from './sync.js';
import type { AppConfig } from '../config/schema.js';
import { isActionAllowed } from '../policy/autopilot-policy.js';
import { GitHubIssueSyncClient } from '../providers/github/issues.js';
import { SentryPerformanceClient, type SentryPerformanceBottleneck } from '../providers/sentry/performance.js';

export type AgentPerformanceOptions = {
  apply?: boolean;
  limit?: number;
  redispatch?: boolean;
};

export type AgentPerformanceResult = {
  bottleneckId: string;
  fingerprint: string;
  transaction: string;
  spanOp: string;
  action: 'would_create_issue' | 'would_update_issue' | 'created_issue' | 'updated_issue' | 'blocked' | 'ignored';
  agentDispatch?: 'would_dispatch' | 'dispatched' | 'skipped' | 'blocked';
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  reason?: string;
};

export type AgentPerformanceSummary = {
  ok: boolean;
  dryRun: boolean;
  enabled: boolean;
  bottleneckCount: number;
  results: AgentPerformanceResult[];
};

type SentryPerformancePort = Pick<SentryPerformanceClient, 'listProductionBottlenecks'>;
type GitHubPerformancePort = Pick<
  GitHubIssueSyncClient,
  'findIssueByMarker' | 'createIssue' | 'addIssueComment' | 'addIssueLabels' | 'createRepositoryDispatch'
>;

export type AgentPerformanceDependencies = {
  sentry?: SentryPerformancePort;
  github?: GitHubPerformancePort;
};

export async function runAgentPerformanceSync(
  config: AppConfig,
  options: AgentPerformanceOptions = {},
  deps: AgentPerformanceDependencies = {},
): Promise<AgentPerformanceSummary> {
  assertTargetRepositoryConfigured(config);

  const dryRun = !options.apply;
  if (!config.performance.enabled) {
    return { ok: true, dryRun, enabled: false, bottleneckCount: 0, results: [] };
  }

  const sentry = deps.sentry ?? new SentryPerformanceClient(config.sentry, config.performance);
  const github = deps.github ?? new GitHubIssueSyncClient(config.github);
  const bottlenecks = await sentry.listProductionBottlenecks({ limit: options.limit ?? 10 });
  const results: AgentPerformanceResult[] = [];

  for (const bottleneck of bottlenecks) {
    const marker = sentryPerformanceMarker(bottleneck.fingerprint);
    const existing = await github.findIssueByMarker(marker);
    if (existing) {
      results.push(await syncExistingPerformanceIssue(config, github, bottleneck, existing, dryRun, Boolean(options.redispatch)));
      continue;
    }

    results.push(await syncNewPerformanceIssue(config, github, bottleneck, marker, dryRun));
  }

  return {
    ok: results.every((result) => result.action !== 'blocked'),
    dryRun,
    enabled: true,
    bottleneckCount: bottlenecks.length,
    results,
  };
}

export function sentryPerformanceMarker(fingerprint: string): string {
  return `<!-- back-to-service:sentry-performance-fingerprint:${fingerprint} -->`;
}

export function buildPerformanceIssueTitle(bottleneck: SentryPerformanceBottleneck): string {
  return `[Sentry Performance] ${bottleneck.transaction} p95 ${Math.round(bottleneck.p95Ms)}ms`;
}

export function buildPerformanceIssueBody(
  bottleneck: SentryPerformanceBottleneck,
  marker = sentryPerformanceMarker(bottleneck.fingerprint),
): string {
  return [
    marker,
    '',
    '## Production Performance Bottleneck',
    '',
    `**Incident kind:** performance`,
    `**Transaction:** ${bottleneck.transaction}`,
    `**Span op:** ${bottleneck.spanOp}`,
    `**Span description:** ${bottleneck.spanDescription}`,
    `**Environment:** ${bottleneck.environment}`,
    `**Severity:** ${bottleneck.severity}`,
    `**Samples:** ${bottleneck.count}`,
    `**Average:** ${Math.round(bottleneck.avgMs)}ms`,
    `**p75:** ${Math.round(bottleneck.p75Ms)}ms`,
    `**p95:** ${Math.round(bottleneck.p95Ms)}ms`,
    `**p99:** ${Math.round(bottleneck.p99Ms)}ms`,
    bottleneck.baselineP95Ms != null ? `**Baseline p95:** ${Math.round(bottleneck.baselineP95Ms)}ms` : undefined,
    bottleneck.regressionRatio != null ? `**Regression ratio:** ${bottleneck.regressionRatio}x` : undefined,
    bottleneck.release ? `**Release:** ${bottleneck.release}` : undefined,
    bottleneck.permalink ? `**Sentry trace search:** ${bottleneck.permalink}` : undefined,
    '',
    '## Agent Status',
    '',
    '- Intake: performance bottleneck detected',
    '- Diagnosis: pending',
    '- Patch: optimization PR only',
    '- Merge: human review required by default',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export function buildPerformanceUpdateComment(bottleneck: SentryPerformanceBottleneck): string {
  return [
    '## Patchpilot Performance Update',
    '',
    `Sentry still reports a production performance bottleneck for ${bottleneck.transaction}.`,
    `Span: ${bottleneck.spanOp} - ${bottleneck.spanDescription}`,
    `Samples: ${bottleneck.count}`,
    `Current p95: ${Math.round(bottleneck.p95Ms)}ms`,
    bottleneck.baselineP95Ms != null ? `Baseline p95: ${Math.round(bottleneck.baselineP95Ms)}ms` : undefined,
    bottleneck.regressionRatio != null ? `Regression ratio: ${bottleneck.regressionRatio}x` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export function performanceIssueLabels(bottleneck: SentryPerformanceBottleneck): string[] {
  return ['sentry', 'production', 'back-to-service:performance', `severity:${bottleneck.severity}`];
}

function baseResult(bottleneck: SentryPerformanceBottleneck) {
  return {
    bottleneckId: bottleneck.id,
    fingerprint: bottleneck.fingerprint,
    transaction: bottleneck.transaction,
    spanOp: bottleneck.spanOp,
  };
}

async function syncExistingPerformanceIssue(
  config: AppConfig,
  github: GitHubPerformancePort,
  bottleneck: SentryPerformanceBottleneck,
  existing: { number: number; htmlUrl?: string },
  dryRun: boolean,
  redispatch: boolean,
): Promise<AgentPerformanceResult> {
  if (dryRun) {
    return {
      ...baseResult(bottleneck),
      action: 'would_update_issue',
      agentDispatch: redispatch ? 'would_dispatch' : 'skipped',
      githubIssueNumber: existing.number,
      githubIssueUrl: existing.htmlUrl,
    };
  }

  if (!isActionAllowed(config.autopilot, 'update_issue')) {
    return {
      ...baseResult(bottleneck),
      action: 'blocked',
      agentDispatch: 'skipped',
      githubIssueNumber: existing.number,
      githubIssueUrl: existing.htmlUrl,
      reason: 'Autopilot policy blocked update_issue',
    };
  }

  await github.addIssueComment(existing.number, buildPerformanceUpdateComment(bottleneck));
  await github.addIssueLabels(existing.number, performanceIssueLabels(bottleneck));

  const agentDispatch = redispatch
    ? await maybeDispatchPerformanceAgent(config, github, bottleneck, existing.number, existing.htmlUrl, dryRun)
    : 'skipped';

  return {
    ...baseResult(bottleneck),
    action: 'updated_issue',
    agentDispatch,
    githubIssueNumber: existing.number,
    githubIssueUrl: existing.htmlUrl,
  };
}

async function syncNewPerformanceIssue(
  config: AppConfig,
  github: GitHubPerformancePort,
  bottleneck: SentryPerformanceBottleneck,
  marker: string,
  dryRun: boolean,
): Promise<AgentPerformanceResult> {
  if (dryRun) {
    return { ...baseResult(bottleneck), action: 'would_create_issue', agentDispatch: 'would_dispatch' };
  }

  if (!isActionAllowed(config.autopilot, 'create_issue')) {
    return {
      ...baseResult(bottleneck),
      action: 'blocked',
      agentDispatch: 'skipped',
      reason: 'Autopilot policy blocked create_issue',
    };
  }

  const created = await github.createIssue({
    title: buildPerformanceIssueTitle(bottleneck),
    body: buildPerformanceIssueBody(bottleneck, marker),
  });

  if (isActionAllowed(config.autopilot, 'update_issue')) {
    await github.addIssueLabels(created.number, performanceIssueLabels(bottleneck));
  }

  const agentDispatch = await maybeDispatchPerformanceAgent(config, github, bottleneck, created.number, created.htmlUrl, dryRun);

  return {
    ...baseResult(bottleneck),
    action: 'created_issue',
    agentDispatch,
    githubIssueNumber: created.number,
    githubIssueUrl: created.htmlUrl,
  };
}

async function maybeDispatchPerformanceAgent(
  config: AppConfig,
  github: GitHubPerformancePort,
  bottleneck: SentryPerformanceBottleneck,
  githubIssueNumber: number,
  githubIssueUrl: string | undefined,
  dryRun: boolean,
): Promise<NonNullable<AgentPerformanceResult['agentDispatch']>> {
  if (dryRun) {
    return 'would_dispatch';
  }

  if (!isActionAllowed(config.autopilot, 'trigger_claude') && !isActionAllowed(config.autopilot, 'trigger_agent')) {
    return 'blocked';
  }

  await github.createRepositoryDispatch(repairDispatchEvent(config), {
    incidentKind: 'performance',
    sentryPerformanceFingerprint: bottleneck.fingerprint,
    issueNumber: githubIssueNumber,
    issueUrl: githubIssueUrl,
    title: buildPerformanceIssueTitle(bottleneck),
    marker: sentryPerformanceMarker(bottleneck.fingerprint),
    repairProvider: config.repair.provider,
    performance: {
      transaction: bottleneck.transaction,
      spanOp: bottleneck.spanOp,
      spanDescription: bottleneck.spanDescription,
      environment: bottleneck.environment,
      severity: bottleneck.severity,
      count: bottleneck.count,
      avgMs: bottleneck.avgMs,
      p75Ms: bottleneck.p75Ms,
      p95Ms: bottleneck.p95Ms,
      p99Ms: bottleneck.p99Ms,
      baselineP95Ms: bottleneck.baselineP95Ms,
      regressionRatio: bottleneck.regressionRatio,
      release: bottleneck.release,
      permalink: bottleneck.permalink,
    },
  });
  await github.addIssueComment(githubIssueNumber, buildPerformanceDispatchComment(bottleneck, config));

  return 'dispatched';
}

function buildPerformanceDispatchComment(bottleneck: SentryPerformanceBottleneck, config: AppConfig): string {
  const workerName = repairWorkerName(config);
  return [
    `## Patchpilot - ${workerName} queued`,
    '',
    `${workerName} was dispatched to open an optimization PR for this Sentry performance bottleneck.`,
    '',
    `Target: ${bottleneck.transaction}`,
    `Current p95: ${Math.round(bottleneck.p95Ms)}ms`,
    bottleneck.baselineP95Ms != null ? `Baseline p95: ${Math.round(bottleneck.baselineP95Ms)}ms` : undefined,
    '',
    'Allowed: inspect traces and repository code, apply the smallest safe optimization, run checks, and open or update a draft PR.',
    'Blocked: merge, deploy, rollback, secret exposure, and unrelated refactors.',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}
