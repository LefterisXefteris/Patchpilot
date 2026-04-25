import { AppConfigSchema, type AppConfig, type RecoveryAction, recoveryActions } from './schema.js';
import { EnvSecretStore } from '../secrets/env-secret-store.js';
import type { SecretStore } from '../secrets/types.js';

const recoveryActionSet = new Set<string>(recoveryActions);

export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === '') {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value == null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRecoveryActions(value: string | undefined): RecoveryAction[] {
  return parseCsv(value).filter((action): action is RecoveryAction => recoveryActionSet.has(action));
}

export async function loadConfig(
  secretStore: SecretStore,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppConfig> {
  const config = {
    runtime: {
      nodeEnv: env.NODE_ENV ?? 'development',
      logLevel: env.BTS_LOG_LEVEL ?? 'info',
      dryRun: parseBoolean(env.BTS_DRY_RUN, true),
    },
    sentry: {
      authToken: await secretStore.require('SENTRY_AUTH_TOKEN'),
      orgSlug: env.SENTRY_ORG_SLUG,
      projectSlug: env.SENTRY_PROJECT_SLUG,
      environment: env.SENTRY_ENVIRONMENT ?? 'production',
      regionUrl: env.SENTRY_REGION_URL ?? 'https://sentry.io',
      webhookSecret: await secretStore.get('SENTRY_WEBHOOK_SECRET'),
    },
    github: {
      appId: env.GITHUB_APP_ID,
      privateKey: await secretStore.require('GITHUB_APP_PRIVATE_KEY'),
      installationId: env.GITHUB_INSTALLATION_ID,
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      webhookSecret: await secretStore.get('GITHUB_WEBHOOK_SECRET'),
      baseBranch: env.GITHUB_BASE_BRANCH ?? 'main',
    },
    vercel: {
      token: await secretStore.require('VERCEL_TOKEN'),
      teamId: env.VERCEL_TEAM_ID,
      teamSlug: env.VERCEL_TEAM_SLUG,
      projectId: env.VERCEL_PROJECT_ID,
      projectName: env.VERCEL_PROJECT_NAME,
    },
    autopilot: {
      enabled: parseBoolean(env.AUTOPILOT_ENABLED, false),
      dryRun: parseBoolean(env.AUTOPILOT_DRY_RUN, true),
      emergencyStop: parseBoolean(env.AUTOPILOT_EMERGENCY_STOP, false),
      confidenceThreshold: parseNumber(env.AUTOPILOT_CONFIDENCE_THRESHOLD, 0.85),
      maxFilesChanged: parseNumber(env.AUTOPILOT_MAX_FILES_CHANGED, 5),
      maxLinesChanged: parseNumber(env.AUTOPILOT_MAX_LINES_CHANGED, 250),
      allowedActions: parseRecoveryActions(env.AUTOPILOT_ALLOWED_ACTIONS),
      protectedPaths: parseCsv(env.AUTOPILOT_PROTECTED_PATHS),
      allowMerge: parseBoolean(env.AUTOPILOT_ALLOW_MERGE, false),
      allowDeploy: parseBoolean(env.AUTOPILOT_ALLOW_DEPLOY, false),
      allowRollback: parseBoolean(env.AUTOPILOT_ALLOW_ROLLBACK, false),
      allowRecoveryHook: parseBoolean(env.AUTOPILOT_ALLOW_RECOVERY_HOOK, false),
    },
  };

  return AppConfigSchema.parse(config);
}

export async function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  return loadConfig(new EnvSecretStore(env), env);
}
