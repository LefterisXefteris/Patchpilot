import type { IncidentMemoryRecord } from '../memory/incident-memory.js';
import type { JsonObject, JsonValue } from '../agentic/types.js';

export type SuspectFile = {
  path: string;
  score: number;
  reason: string;
  source: 'stack' | 'memory' | 'stack+memory';
};

export type SuspectFileMapping = {
  suspectFiles: SuspectFile[];
  primaryFile?: string;
  mappingConfidence: number;
};

export function mapSuspectFiles(input: {
  event?: JsonObject | null;
  memories?: IncidentMemoryRecord[];
  limit?: number;
}): SuspectFileMapping {
  const scores = new Map<string, SuspectFile>();
  const limit = input.limit ?? 5;

  for (const frame of extractFrames(input.event)) {
    const normalized = normalizeSentryFilePath(String(frame.filename ?? frame.absPath ?? frame.module ?? ''));
    if (!normalized) {
      continue;
    }
    const fn = String(frame.function ?? frame.functionName ?? frame.name ?? 'unknown');
    mergeSuspect(scores, {
      path: normalized,
      score: 70,
      reason: `current Sentry stack frame${fn && fn !== 'unknown' ? ` in ${fn}` : ''}`,
      source: 'stack',
    });
  }

  for (const memory of input.memories ?? []) {
    const metadataFiles = suspectFilesFromMetadata(memory.metadata);
    const stackFiles = filesFromStackSignature(memory.stackSignature);
    for (const file of [...metadataFiles, ...stackFiles]) {
      const normalized = normalizeSentryFilePath(file);
      if (!normalized) {
        continue;
      }
      mergeSuspect(scores, {
        path: normalized,
        score: 35 + Math.round(memory.confidence * 20),
        reason: `similar prior incident (${memory.outcome})`,
        source: 'memory',
      });
    }
  }

  const suspectFiles = [...scores.values()]
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit)
    .map((file) => ({ ...file, score: Math.min(file.score, 100) }));

  return {
    suspectFiles,
    primaryFile: suspectFiles[0]?.path,
    mappingConfidence: suspectFiles[0] ? Number(Math.min(0.95, suspectFiles[0].score / 100).toFixed(2)) : 0,
  };
}

export function normalizeSentryFilePath(rawPath: string): string | undefined {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^(?:node:|https?:|chrome-extension:|webpack-internal:)/i.test(trimmed)) {
    return undefined;
  }

  let path = trimmed
    .replace(/\\/g, '/')
    .replace(/^webpack:\/\/[^/]+\//, '')
    .replace(/^app:\/\/\//, '')
    .replace(/^file:\/\/\//, '')
    .replace(/^\/+workspace\//, '')
    .replace(/^\/+var\/task\//, '')
    .replace(/^\/+app\//, '')
    .replace(/^\/+/, '');

  const srcIndex = path.indexOf('src/');
  if (srcIndex > 0) {
    path = path.slice(srcIndex);
  }

  if (isNoisyPath(path)) {
    return undefined;
  }

  return path || undefined;
}

export function formatSuspectFiles(mapping: SuspectFileMapping, maxChars = 700): string {
  if (mapping.suspectFiles.length === 0 || maxChars <= 0) {
    return '';
  }

  const lines = [
    `Suspect files (inspect first; broaden search if these do not explain the issue, confidence ${mapping.mappingConfidence.toFixed(2)}):`,
    ...mapping.suspectFiles.map((file, index) => `${index + 1}. ${file.path} - ${file.reason}`),
  ];
  const text = lines.join('\n');
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function mergeSuspect(target: Map<string, SuspectFile>, next: SuspectFile): void {
  const existing = target.get(next.path);
  if (!existing) {
    target.set(next.path, next);
    return;
  }

  target.set(next.path, {
    path: next.path,
    score: existing.score + next.score,
    reason: existing.reason.includes(next.reason) ? existing.reason : `${existing.reason}; ${next.reason}`,
    source: existing.source === next.source ? existing.source : 'stack+memory',
  });
}

function extractFrames(event: JsonObject | null | undefined): JsonObject[] {
  if (!event) {
    return [];
  }

  if (Array.isArray(event.stack)) {
    return event.stack.filter(isObject);
  }

  const exception = event.exception;
  if (!isObject(exception) || !Array.isArray(exception.values)) {
    return [];
  }

  return exception.values.flatMap((value) => {
    if (!isObject(value) || !isObject(value.stacktrace) || !Array.isArray(value.stacktrace.frames)) {
      return [];
    }
    return value.stacktrace.frames.filter(isObject);
  });
}

function suspectFilesFromMetadata(metadata: JsonObject): string[] {
  const direct = metadata.suspectFiles;
  if (Array.isArray(direct)) {
    return direct
      .map((item) => (isObject(item) ? item.path : item))
      .filter((item): item is string => typeof item === 'string');
  }

  const primary = metadata.primaryFile;
  return typeof primary === 'string' ? [primary] : [];
}

function filesFromStackSignature(stackSignature: string): string[] {
  if (!stackSignature || stackSignature === 'no-stack') {
    return [];
  }

  return stackSignature
    .split(' > ')
    .map((frame) => frame.split(':')[0])
    .filter((file): file is string => Boolean(file));
}

function isNoisyPath(path: string): boolean {
  return (
    path.includes('node_modules/') ||
    path.includes('/.next/') ||
    path.includes('/dist/') ||
    path.includes('/build/') ||
    path.includes('/vendor/') ||
    /(?:^|\/)(webpack|react-dom|scheduler|next|pages-manifest|framework)-[^/]*\.js$/i.test(path) ||
    /\.(?:map|min\.js)$/.test(path)
  );
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
