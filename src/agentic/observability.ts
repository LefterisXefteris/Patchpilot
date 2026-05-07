import { redactText } from '../security/redact.js';
import type { JsonValue } from './types.js';

const secretPatterns = [
  /sntrys_[A-Za-z0-9_=+/.-]+/g,
  /vcp_[A-Za-z0-9]+/g,
  /ghp_[A-Za-z0-9_]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g,
];

export function redactJson(value: JsonValue | undefined, extraSecrets: Array<string | undefined> = []): JsonValue {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    let redacted = redactText(value, extraSecrets);
    for (const pattern of secretPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item, extraSecrets));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/token|secret|password|authorization|cookie|private/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, redactJson(item, extraSecrets)];
    }),
  );
}

export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const promptCostPerMillion = 0.15;
  const completionCostPerMillion = 0.6;
  return Number(
    ((promptTokens / 1_000_000) * promptCostPerMillion + (completionTokens / 1_000_000) * completionCostPerMillion).toFixed(6),
  );
}

export function logJson(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event));
}

