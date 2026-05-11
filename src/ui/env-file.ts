import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type EnvFileData = Record<string, string>;

export function readEnvFile(path = '.env'): EnvFileData {
  if (!existsSync(path)) {
    return {};
  }

  const data: EnvFileData = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    data[key] = unquoteEnvValue(rawValue);
  }

  return data;
}

export function writeEnvFile(values: EnvFileData, path = '.env'): void {
  const orderedKeys = [
    'NODE_ENV',
    'BTS_LOG_LEVEL',
    'BTS_DRY_RUN',
    'SENTRY_AUTH_TOKEN',
    'SENTRY_ORG_SLUG',
    'SENTRY_PROJECT_SLUG',
    'SENTRY_ENVIRONMENT',
    'SENTRY_REGION_URL',
    'SENTRY_WEBHOOK_SECRET',
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_INSTALLATION_ID',
    'GITHUB_OWNER',
    'GITHUB_REPO',
    'GITHUB_TARGET_INSTALLATION_ID',
    'GITHUB_TARGET_OWNER',
    'GITHUB_TARGET_REPO',
    'GITHUB_WEBHOOK_SECRET',
    'GITHUB_BASE_BRANCH',
    'VERCEL_TOKEN',
    'VERCEL_TEAM_ID',
    'VERCEL_TEAM_SLUG',
    'VERCEL_PROJECT_ID',
    'VERCEL_PROJECT_NAME',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'BTS_REPAIR_PROVIDER',
    'AUTOPILOT_ENABLED',
    'AUTOPILOT_DRY_RUN',
    'AUTOPILOT_CONFIDENCE_THRESHOLD',
    'AUTOPILOT_MAX_FILES_CHANGED',
    'AUTOPILOT_MAX_LINES_CHANGED',
    'AUTOPILOT_ALLOWED_ACTIONS',
    'AUTOPILOT_PROTECTED_PATHS',
    'AUTOPILOT_ALLOW_MERGE',
    'AUTOPILOT_ALLOW_DEPLOY',
    'AUTOPILOT_ALLOW_ROLLBACK',
    'AUTOPILOT_ALLOW_RECOVERY_HOOK',
    'AUTOPILOT_EMERGENCY_STOP',
  ];
  const extraKeys = Object.keys(values)
    .filter((key) => !orderedKeys.includes(key))
    .sort();
  const lines = [...orderedKeys, ...extraKeys]
    .filter((key) => values[key] !== undefined)
    .map((key) => `${key}=${quoteEnvValue(values[key] ?? '')}`);

  writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o600 });
}

function unquoteEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\n/g, '\n');
  }

  return value;
}

function quoteEnvValue(value: string): string {
  if (value.includes('\n') || value.includes(' ') || value.includes('"')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }

  return value;
}
