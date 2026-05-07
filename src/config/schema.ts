import { z } from 'zod';

export const recoveryActions = [
  'create_issue',
  'update_issue',
  'trigger_agent',
  'trigger_claude',
  'create_branch',
  'apply_patch',
  'open_pr',
  'merge_pr',
  'monitor_deployment',
  'redeploy',
  'rollback',
  'run_recovery_hook',
] as const;

export const RecoveryActionSchema = z.enum(recoveryActions);

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);
const requiredString = (envName: string) =>
  z.string({ required_error: `${envName} is required` }).min(1, `${envName} is required`);

export const AppConfigSchema = z.object({
  runtime: z.object({
    nodeEnv: z.string().default('development'),
    logLevel: z.string().default('info'),
    dryRun: z.boolean().default(true),
  }),
  sentry: z.object({
    authToken: requiredString('SENTRY_AUTH_TOKEN'),
    orgSlug: requiredString('SENTRY_ORG_SLUG'),
    projectSlug: requiredString('SENTRY_PROJECT_SLUG'),
    environment: z.string().default('production'),
    regionUrl: z.string().url().default('https://sentry.io'),
    webhookSecret: optionalString,
  }),
  github: z.object({
    appId: requiredString('GITHUB_APP_ID'),
    privateKey: requiredString('GITHUB_APP_PRIVATE_KEY'),
    installationId: requiredString('GITHUB_INSTALLATION_ID'),
    owner: requiredString('GITHUB_OWNER'),
    repo: requiredString('GITHUB_REPO'),
    targetInstallationId: optionalString,
    targetOwner: optionalString,
    targetRepo: optionalString,
    webhookSecret: optionalString,
    baseBranch: z.string().default('main'),
  }),
  vercel: z.object({
    token: requiredString('VERCEL_TOKEN'),
    teamId: optionalString,
    teamSlug: optionalString,
    projectId: requiredString('VERCEL_PROJECT_ID'),
    projectName: optionalString,
  }),
  autopilot: z.object({
    enabled: z.boolean().default(false),
    dryRun: z.boolean().default(true),
    emergencyStop: z.boolean().default(false),
    confidenceThreshold: z.number().min(0).max(1).default(0.85),
    maxFilesChanged: z.number().int().positive().default(5),
    maxLinesChanged: z.number().int().positive().default(250),
    allowedActions: z.array(RecoveryActionSchema).default(['create_issue', 'update_issue', 'open_pr']),
    protectedPaths: z.array(z.string()).default(['.github/workflows/**', 'infra/**', 'prisma/**']),
    allowMerge: z.boolean().default(false),
    allowDeploy: z.boolean().default(false),
    allowRollback: z.boolean().default(false),
    allowRecoveryHook: z.boolean().default(false),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;
