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

export function parseGitHubRepositoryInput(value: string | undefined): { owner?: string; repo?: string } {
  const trimmed = value?.trim();

  if (!trimmed) {
    return {};
  }

  let path = trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'github.com') {
      return {};
    }
    path = url.pathname;
  } catch {
    // Plain owner/repo strings are valid too.
  }

  const [owner, repo] = path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

  if (!owner || !repo) {
    return {};
  }

  return {
    owner,
    repo: repo.endsWith('.git') ? repo.slice(0, -4) : repo,
  };
}

function resolveGitHubRepository(owner: string | undefined, repo: string | undefined): { owner?: string; repo?: string } {
  const parsedRepo = parseGitHubRepositoryInput(repo);
  if (parsedRepo.owner && parsedRepo.repo) {
    return parsedRepo;
  }

  const parsedOwner = parseGitHubRepositoryInput(owner);
  if (parsedOwner.owner && parsedOwner.repo) {
    return parsedOwner;
  }

  return { owner, repo };
}

export async function loadConfig(
  secretStore: SecretStore,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppConfig> {
  const agentRepository = resolveGitHubRepository(env.GITHUB_OWNER, env.GITHUB_REPO);
  const targetRepository = resolveGitHubRepository(env.GITHUB_TARGET_OWNER, env.GITHUB_TARGET_REPO);

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
      owner: agentRepository.owner,
      repo: agentRepository.repo,
      targetInstallationId: env.GITHUB_TARGET_INSTALLATION_ID,
      targetOwner: targetRepository.owner,
      targetRepo: targetRepository.repo,
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
    target: {
      productionUrl: env.BTS_TARGET_PRODUCTION_URL,
      healthCheckPath: env.BTS_TARGET_HEALTH_CHECK_PATH ?? '/',
      healthCheckExpectedStatus: parseNumber(env.BTS_TARGET_HEALTH_CHECK_STATUS, 200),
      healthCheckTimeoutMs: parseNumber(env.BTS_TARGET_HEALTH_CHECK_TIMEOUT_MS, 10_000),
      vercelProjectId: env.BTS_TARGET_VERCEL_PROJECT_ID ?? env.VERCEL_PROJECT_ID,
      vercelTeamId: env.BTS_TARGET_VERCEL_TEAM_ID ?? env.VERCEL_TEAM_ID,
      sentryProjectSlug: env.BTS_TARGET_SENTRY_PROJECT_SLUG ?? env.SENTRY_PROJECT_SLUG,
    },
    recovery: {
      maxAttempts: parseNumber(env.BTS_RECOVERY_MAX_ATTEMPTS, 3),
      partialToleranceCycles: parseNumber(env.BTS_RECOVERY_PARTIAL_TOLERANCE, 2),
      minDeployAgeSeconds: parseNumber(env.BTS_RECOVERY_MIN_DEPLOY_AGE_SECONDS, 60),
      needsHumanLabel: env.BTS_RECOVERY_NEEDS_HUMAN_LABEL ?? 'needs-human',
      resolvedLabel: env.BTS_RECOVERY_RESOLVED_LABEL ?? 'auto-recovery-resolved',
    },
    performance: {
      enabled: parseBoolean(env.PERF_ENABLED, false),
      minSampleCount: parseNumber(env.PERF_MIN_SAMPLE_COUNT, 20),
      p95ThresholdMs: parseNumber(env.PERF_P95_THRESHOLD_MS, 1_000),
      regressionRatio: parseNumber(env.PERF_REGRESSION_RATIO, 1.5),
      allowedOps: parseCsv(env.PERF_ALLOWED_OPS).length
        ? parseCsv(env.PERF_ALLOWED_OPS)
        : ['http.server', 'db', 'http.client', 'navigation'],
    },
    repair: {
      provider: env.BTS_REPAIR_PROVIDER ?? 'claude',
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
