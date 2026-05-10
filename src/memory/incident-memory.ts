import { createHash } from 'node:crypto';

import { redactJson } from '../agentic/observability.js';
import type { JsonObject, JsonValue } from '../agentic/types.js';

export type IncidentMemoryInput = {
  sentryIssueId?: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  title: string;
  environment: string;
  event?: JsonObject | null;
  rootCauseSummary: string;
  fixSummary: string;
  outcome: string;
  confidence: number;
  labels?: string[];
  metadata?: JsonObject;
};

export type IncidentMemoryRecord = {
  id: string;
  sentryIssueId?: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  title: string;
  environment: string;
  stackSignature: string;
  fingerprint: string;
  rootCauseSummary: string;
  fixSummary: string;
  outcome: string;
  confidence: number;
  labels: string[];
  metadata: JsonObject;
  createdAt?: string;
  updatedAt?: string;
};

export type IncidentMemoryQuery = {
  sentryIssueId?: string;
  title: string;
  environment: string;
  event?: JsonObject | null;
  labels?: string[];
};

export function buildIncidentMemory(input: IncidentMemoryInput, extraSecrets: Array<string | undefined> = []): IncidentMemoryRecord {
  const stackSignature = buildStackSignature(input.event);
  const redactedMetadata = redactJson(input.metadata ?? {}, extraSecrets) as JsonObject;
  const redactedTitle = compactText(String(redactJson(input.title, extraSecrets) ?? ''), 180);
  const redactedRootCause = compactText(String(redactJson(input.rootCauseSummary, extraSecrets) ?? ''), 240);
  const redactedFix = compactText(String(redactJson(input.fixSummary, extraSecrets) ?? ''), 240);
  const fingerprint = buildIncidentFingerprint({
    title: redactedTitle,
    environment: input.environment,
    stackSignature,
  });

  return {
    id: `mem_${fingerprint}`,
    sentryIssueId: input.sentryIssueId,
    githubIssueNumber: input.githubIssueNumber,
    githubIssueUrl: input.githubIssueUrl,
    title: redactedTitle,
    environment: input.environment,
    stackSignature,
    fingerprint,
    rootCauseSummary: redactedRootCause,
    fixSummary: redactedFix,
    outcome: compactText(String(redactJson(input.outcome, extraSecrets) ?? ''), 80),
    confidence: input.confidence,
    labels: (input.labels ?? []).map((label) => compactText(label, 40)),
    metadata: redactedMetadata,
  };
}

export function buildIncidentMemoryQuery(input: IncidentMemoryQuery): IncidentMemoryQuery & { stackSignature: string; fingerprint: string } {
  const stackSignature = buildStackSignature(input.event);
  return {
    ...input,
    stackSignature,
    fingerprint: buildIncidentFingerprint({
      title: input.title,
      environment: input.environment,
      stackSignature,
    }),
  };
}

export function buildStackSignature(event: JsonObject | null | undefined): string {
  const frames = extractFrames(event);
  if (frames.length === 0) {
    return 'no-stack';
  }

  return frames
    .slice(0, 5)
    .map((frame) => {
      const filename = compactPath(String(frame.filename ?? frame.absPath ?? frame.module ?? 'unknown'));
      const fn = String(frame.function ?? frame.functionName ?? frame.name ?? 'unknown');
      return `${filename}:${fn}`;
    })
    .join(' > ');
}

export function buildIncidentFingerprint(input: { title: string; environment: string; stackSignature: string }): string {
  const normalized = [
    input.environment.toLowerCase(),
    normalizeText(input.title).split(' ').slice(0, 12).join(' '),
    normalizeText(input.stackSignature),
  ].join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function scoreIncidentMemory(
  memory: IncidentMemoryRecord,
  query: IncidentMemoryQuery & { stackSignature: string; fingerprint: string },
): number {
  let score = 0;
  if (memory.sentryIssueId && query.sentryIssueId && memory.sentryIssueId === query.sentryIssueId) {
    score += 100;
  }
  if (memory.fingerprint === query.fingerprint) {
    score += 60;
  }
  if (memory.environment === query.environment) {
    score += 15;
  }
  if (memory.stackSignature !== 'no-stack' && memory.stackSignature === query.stackSignature) {
    score += 40;
  } else if (sharesStackFile(memory.stackSignature, query.stackSignature)) {
    score += 20;
  }

  const sharedTitleTokens = intersectionSize(tokenize(memory.title), tokenize(query.title));
  score += Math.min(sharedTitleTokens * 4, 24);

  return score;
}

export function formatIncidentMemories(memories: IncidentMemoryRecord[], maxChars = 1000): string {
  if (memories.length === 0 || maxChars <= 0) {
    return '';
  }

  const lines = ['Relevant prior incidents (advisory only; verify against current evidence):'];
  for (const memory of memories.slice(0, 3)) {
    lines.push(
      `- ${memory.title} [${memory.outcome}, confidence ${memory.confidence.toFixed(2)}]: root cause: ${memory.rootCauseSummary}; fix: ${memory.fixSummary}; stack: ${memory.stackSignature}`,
    );
  }

  const text = lines.join('\n');
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function extractFrames(event: JsonObject | null | undefined): JsonObject[] {
  if (!event) {
    return [];
  }

  const direct = event.stack;
  if (Array.isArray(direct)) {
    return direct.filter(isObject);
  }

  const exception = event.exception;
  if (isObject(exception)) {
    const values = exception.values;
    if (Array.isArray(values)) {
      return values.flatMap((value) => {
        if (!isObject(value) || !isObject(value.stacktrace) || !Array.isArray(value.stacktrace.frames)) {
          return [];
        }
        return value.stacktrace.frames.filter(isObject);
      });
    }
  }

  return [];
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactPath(path: string): string {
  return path.replace(/^webpack:\/\/[^/]+\//, '').split('/').slice(-3).join('/');
}

function compactText(value: string, maxLength: number): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_:.-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length >= 4 && !['error', 'typeerror', 'sentry', 'production'].includes(token)),
  );
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) {
      count += 1;
    }
  }
  return count;
}

function sharesStackFile(left: string, right: string): boolean {
  if (left === 'no-stack' || right === 'no-stack') {
    return false;
  }
  const leftFiles = new Set(left.split(' > ').map((frame) => frame.split(':')[0]));
  return right.split(' > ').some((frame) => leftFiles.has(frame.split(':')[0] ?? ''));
}
