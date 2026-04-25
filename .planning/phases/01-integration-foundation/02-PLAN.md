---
phase: 1
plan: 2
title: "Configuration, Secrets, Redaction, and Autopilot Policy"
type: execute
wave: 2
depends_on:
  - 1
files_modified:
  - src/config/schema.ts
  - src/config/env.ts
  - src/secrets/types.ts
  - src/secrets/env-secret-store.ts
  - src/security/redact.ts
  - src/policy/autopilot-policy.ts
  - tests/config-env.test.ts
  - tests/env-secret-store.test.ts
  - tests/redact.test.ts
  - tests/autopilot-policy.test.ts
autonomous: true
requirements:
  - CONF-01
  - CONF-02
  - CONF-03
  - CONF-04
must_haves:
  truths:
    - "Configuration is typed and provider secret values flow through SecretStore."
    - "Autopilot policy denies production mutation by default."
    - "Redaction masks known secret values and sensitive key names."
  artifacts:
    - "src/config/schema.ts"
    - "src/config/env.ts"
    - "src/secrets/env-secret-store.ts"
    - "src/security/redact.ts"
    - "src/policy/autopilot-policy.ts"
  key_links:
    - "src/config/env.ts loadConfig(secretStore, env) -> EnvSecretStore -> AppConfigSchema"
    - "src/policy/autopilot-policy.ts isActionAllowed -> allowRecoveryHook/allowRollback/allowDeploy/allowMerge"
---

<objective>
Implement typed configuration loading, environment-backed secrets, sensitive-value redaction, and autopilot policy gates for provider credentials and production mutation controls.
</objective>

<threat_model>
Assets: provider tokens, GitHub private key, webhook secrets, production identifiers, autopilot mutation settings.

Threats:
- Invalid config silently targeting the wrong Sentry project, GitHub repo, or Vercel project.
- Secret values leaking through thrown errors, validation output, or logs.
- Autopilot mutation accidentally enabled by permissive defaults.
- Protected files or low-confidence fixes bypassing policy.

Mitigations in this plan:
- Zod schema rejects missing or malformed config with named keys.
- Secret store reads values from env and never serializes secrets.
- Redaction helper masks known secret values and sensitive keys.
- Policy defaults disable autopilot, keep dry-run enabled, and deny merge/deploy/rollback by default.
- Policy helper tests cover emergency stop, confidence threshold, action allowlist, protected paths, and mutation toggles.
</threat_model>

<tasks>

<task id="2.1" type="execute">
<title>Implement typed app configuration schema</title>
<read_first>
- AGENTS.md
- .env.example
- .planning/phases/01-integration-foundation/01-RESEARCH.md
- src/types/integration-validation.ts
</read_first>
<files>
- src/config/schema.ts
</files>
<action>
Create `src/config/schema.ts` using `zod`. Export:
- `recoveryActions` as a readonly tuple containing `create_issue`, `update_issue`, `create_branch`, `apply_patch`, `open_pr`, `merge_pr`, `monitor_deployment`, `redeploy`, `rollback`, and `run_recovery_hook`.
- `RecoveryActionSchema`.
- `AppConfigSchema` with nested objects:
  - `runtime`: `nodeEnv`, `logLevel`, `dryRun`
  - `sentry`: `authToken`, `orgSlug`, `projectSlug`, `environment`, `regionUrl`, `webhookSecret`
  - `github`: `appId`, `privateKey`, `installationId`, `owner`, `repo`, `webhookSecret`, `baseBranch`
  - `vercel`: `token`, `teamId`, `teamSlug`, `projectId`, `projectName`
  - `autopilot`: `enabled`, `dryRun`, `emergencyStop`, `confidenceThreshold`, `maxFilesChanged`, `maxLinesChanged`, `allowedActions`, `protectedPaths`, `allowMerge`, `allowDeploy`, `allowRollback`, `allowRecoveryHook`
- `export type AppConfig = z.infer<typeof AppConfigSchema>;`

Validation rules:
- `confidenceThreshold` is a number from `0` to `1`.
- `maxFilesChanged` and `maxLinesChanged` are positive integers.
- `regionUrl` defaults to `https://sentry.io`.
- `github.baseBranch` defaults to `main`.
- `autopilot.enabled` defaults to `false`.
- `autopilot.dryRun` defaults to `true`.
- `autopilot.emergencyStop` defaults to `false`.
- `autopilot.allowMerge`, `autopilot.allowDeploy`, and `autopilot.allowRollback` default to `false`.
- `autopilot.allowRecoveryHook` defaults to `false`.
</action>
<verify>
- `grep -F "export const recoveryActions" src/config/schema.ts`
- `grep -F "allowRecoveryHook" src/config/schema.ts`
- `grep -F ".min(0).max(1)" src/config/schema.ts`
- `npm run typecheck`
</verify>
<automated>true</automated>
<done>
Done when `AppConfigSchema` validates all provider and autopilot fields with safe defaults.
</done>
<acceptance_criteria>
- `src/config/schema.ts` contains `export const recoveryActions`.
- `src/config/schema.ts` contains `confidenceThreshold`.
- `src/config/schema.ts` contains `.min(0).max(1)`.
- `src/config/schema.ts` contains `allowRollback`.
- `src/config/schema.ts` contains `allowRecoveryHook`.
- `src/config/schema.ts` contains `export type AppConfig`.
</acceptance_criteria>
</task>

<task id="2.2" type="execute">
<title>Load configuration from environment variables</title>
<read_first>
- src/config/schema.ts
- .env.example
- .planning/phases/01-integration-foundation/01-RESEARCH.md
</read_first>
<files>
- src/config/env.ts
- tests/config-env.test.ts
</files>
<action>
Create `src/config/env.ts` exporting:
- `parseBoolean(value: string | undefined, defaultValue: boolean): boolean`
- `parseNumber(value: string | undefined, defaultValue: number): number`
- `parseCsv(value: string | undefined): string[]`
- `loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig>`
- `loadConfig(secretStore: SecretStore, env: NodeJS.ProcessEnv = process.env): Promise<AppConfig>`

`loadConfigFromEnv` may exist as a test convenience wrapper, but it must instantiate `new EnvSecretStore(env)` and delegate to `loadConfig`. The single safe production path is `loadConfig(secretStore, env)`.

Map non-secret env vars directly from `env`, and map secret env vars through `await secretStore.get(...)` or `await secretStore.require(...)`.

Secret fields that must be read through `SecretStore`:
- `SENTRY_AUTH_TOKEN`
- `SENTRY_WEBHOOK_SECRET`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `VERCEL_TOKEN`

Non-secret env vars mapped directly:
- `NODE_ENV` -> `runtime.nodeEnv`
- `BTS_LOG_LEVEL` -> `runtime.logLevel`
- `BTS_DRY_RUN` -> `runtime.dryRun`
- `SENTRY_ORG_SLUG` -> `sentry.orgSlug`
- `SENTRY_PROJECT_SLUG` -> `sentry.projectSlug`
- `SENTRY_ENVIRONMENT` -> `sentry.environment`
- `SENTRY_REGION_URL` -> `sentry.regionUrl`
- `GITHUB_APP_ID` -> `github.appId`
- `GITHUB_INSTALLATION_ID` -> `github.installationId`
- `GITHUB_OWNER` -> `github.owner`
- `GITHUB_REPO` -> `github.repo`
- `GITHUB_BASE_BRANCH` -> `github.baseBranch`
- `VERCEL_TEAM_ID` -> `vercel.teamId`
- `VERCEL_TEAM_SLUG` -> `vercel.teamSlug`
- `VERCEL_PROJECT_ID` -> `vercel.projectId`
- `VERCEL_PROJECT_NAME` -> `vercel.projectName`
- `AUTOPILOT_ENABLED` -> `autopilot.enabled`
- `AUTOPILOT_DRY_RUN` -> `autopilot.dryRun`
- `AUTOPILOT_CONFIDENCE_THRESHOLD` -> `autopilot.confidenceThreshold`
- `AUTOPILOT_MAX_FILES_CHANGED` -> `autopilot.maxFilesChanged`
- `AUTOPILOT_MAX_LINES_CHANGED` -> `autopilot.maxLinesChanged`
- `AUTOPILOT_ALLOWED_ACTIONS` -> `autopilot.allowedActions`
- `AUTOPILOT_PROTECTED_PATHS` -> `autopilot.protectedPaths`
- `AUTOPILOT_ALLOW_MERGE` -> `autopilot.allowMerge`
- `AUTOPILOT_ALLOW_DEPLOY` -> `autopilot.allowDeploy`
- `AUTOPILOT_ALLOW_ROLLBACK` -> `autopilot.allowRollback`
- `AUTOPILOT_ALLOW_RECOVERY_HOOK` -> `autopilot.allowRecoveryHook`
- `AUTOPILOT_EMERGENCY_STOP` -> `autopilot.emergencyStop`

Create `tests/config-env.test.ts` covering valid config, missing required Sentry key, missing required GitHub key, missing required Vercel key, CSV parsing, boolean parsing, numeric parsing, and proof that `loadConfig` reads `SENTRY_AUTH_TOKEN`, `GITHUB_APP_PRIVATE_KEY`, and `VERCEL_TOKEN` through the provided `SecretStore`.
</action>
<verify>
- `grep -F "loadConfig(secretStore" src/config/env.ts`
- `grep -F "export async function loadConfigFromEnv" src/config/env.ts`
- `grep -F "new EnvSecretStore" src/config/env.ts`
- `grep -F "SENTRY_AUTH_TOKEN" tests/config-env.test.ts`
- `npm test -- tests/config-env.test.ts`
</verify>
<automated>true</automated>
<done>
Done when `loadConfig` is the async safe path, `loadConfigFromEnv` delegates through `EnvSecretStore`, and config tests prove provider secrets are read through `SecretStore`.
</done>
<acceptance_criteria>
- `src/config/env.ts` contains `loadConfig(secretStore`.
- `src/config/env.ts` contains `export async function loadConfigFromEnv`.
- `src/config/env.ts` contains `new EnvSecretStore`.
- `src/config/env.ts` contains `AUTOPILOT_ALLOWED_ACTIONS`.
- `src/config/env.ts` contains `AUTOPILOT_ALLOW_RECOVERY_HOOK`.
- `src/config/env.ts` contains `SENTRY_AUTH_TOKEN`.
- `src/config/env.ts` contains `GITHUB_APP_PRIVATE_KEY`.
- `src/config/env.ts` contains `VERCEL_PROJECT_ID`.
- `tests/config-env.test.ts` contains `missing required Sentry`.
- `tests/config-env.test.ts` contains `missing required GitHub`.
- `tests/config-env.test.ts` contains `missing required Vercel`.
- `tests/config-env.test.ts` contains `SecretStore`.
- `tests/config-env.test.ts` contains `SENTRY_AUTH_TOKEN`.
</acceptance_criteria>
</task>

<task id="2.3" type="execute">
<title>Implement environment secret store and redaction helper</title>
<read_first>
- AGENTS.md
- .planning/phases/01-integration-foundation/01-VALIDATION.md
</read_first>
<files>
- src/secrets/types.ts
- src/secrets/env-secret-store.ts
- src/security/redact.ts
- tests/env-secret-store.test.ts
- tests/redact.test.ts
</files>
<action>
Create `src/secrets/types.ts` exporting:
```ts
export interface SecretStore {
  get(name: string): Promise<string | undefined>;
  require(name: string): Promise<string>;
}
```

Create `src/secrets/env-secret-store.ts` exporting class `EnvSecretStore implements SecretStore` with constructor `constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}`. `get` returns `this.env[name]`. `require` returns the value or throws `new Error(\`Missing required secret: ${name}\`)`.

Create `src/security/redact.ts` exporting:
- `SENSITIVE_KEY_PATTERN = /(token|secret|authorization|password|private[_-]?key)/i`
- `redactText(input: string, secretValues: Array<string | undefined>): string`
- `redactObject<T>(input: T, secretValues: Array<string | undefined>): T`

`redactText` must replace non-empty secret values with `[REDACTED]`.
`redactObject` must recursively replace values for keys matching `SENSITIVE_KEY_PATTERN` with `[REDACTED]`.

Create tests:
- `tests/env-secret-store.test.ts`
- `tests/redact.test.ts`
</action>
<verify>
- `grep -F "export interface SecretStore" src/secrets/types.ts`
- `grep -F "class EnvSecretStore implements SecretStore" src/secrets/env-secret-store.ts`
- `grep -F "SENSITIVE_KEY_PATTERN" src/security/redact.ts`
- `npm test -- tests/env-secret-store.test.ts tests/redact.test.ts`
</verify>
<automated>true</automated>
<done>
Done when secret reads and redaction helpers are implemented and covered by targeted tests.
</done>
<acceptance_criteria>
- `src/secrets/types.ts` contains `export interface SecretStore`.
- `src/secrets/env-secret-store.ts` contains `class EnvSecretStore implements SecretStore`.
- `src/secrets/env-secret-store.ts` contains `Missing required secret:`.
- `src/security/redact.ts` contains `SENSITIVE_KEY_PATTERN`.
- `src/security/redact.ts` contains `[REDACTED]`.
- `tests/env-secret-store.test.ts` contains `Missing required secret`.
- `tests/redact.test.ts` contains `authorization`.
- `tests/redact.test.ts` contains `[REDACTED]`.
</acceptance_criteria>
</task>

<task id="2.4" type="execute">
<title>Implement autopilot policy gates</title>
<read_first>
- src/config/schema.ts
- .planning/phases/01-integration-foundation/01-RESEARCH.md
- .planning/phases/01-integration-foundation/01-VALIDATION.md
</read_first>
<files>
- src/policy/autopilot-policy.ts
- tests/autopilot-policy.test.ts
</files>
<action>
Create `src/policy/autopilot-policy.ts` exporting:
- `type AutopilotPolicy = AppConfig['autopilot'];`
- `type RecoveryAction = z.infer<typeof RecoveryActionSchema>;`
- `isMutationAction(action: RecoveryAction): boolean`
- `isMutationBlocked(policy: AutopilotPolicy): boolean`
- `isActionAllowed(policy: AutopilotPolicy, action: RecoveryAction): boolean`
- `isConfidenceAllowed(policy: AutopilotPolicy, confidence: number): boolean`
- `isPathProtected(policy: AutopilotPolicy, filePath: string): boolean`
- `canMerge(policy: AutopilotPolicy): boolean`
- `canDeploy(policy: AutopilotPolicy): boolean`
- `canRollback(policy: AutopilotPolicy): boolean`
- `canRunRecoveryHook(policy: AutopilotPolicy): boolean`
- `validatePolicy(policy: AutopilotPolicy): AutopilotPolicy`

Rules:
- `isMutationBlocked` returns true if `policy.emergencyStop` is true or `policy.dryRun` is true or `policy.enabled` is false.
- `isActionAllowed` returns false for all mutation actions when mutation is blocked.
- `isActionAllowed` returns false when the action is absent from `policy.allowedActions`.
- `isActionAllowed` returns false for `merge_pr` unless `policy.allowMerge` is true.
- `isActionAllowed` returns false for `redeploy` unless `policy.allowDeploy` is true.
- `isActionAllowed` returns false for `rollback` unless `policy.allowRollback` is true.
- `isActionAllowed` returns false for `run_recovery_hook` unless `policy.allowRecoveryHook` is true.
- `isConfidenceAllowed` returns `confidence >= policy.confidenceThreshold`.
- `isPathProtected` supports exact matches and simple `/**` prefix globs.

Create `tests/autopilot-policy.test.ts` covering all rules above.
</action>
<verify>
- `grep -F "export function isMutationBlocked" src/policy/autopilot-policy.ts`
- `grep -F "allowRecoveryHook" src/policy/autopilot-policy.ts`
- `grep -F "run_recovery_hook" src/policy/autopilot-policy.ts`
- `npm test -- tests/autopilot-policy.test.ts`
</verify>
<automated>true</automated>
<done>
Done when autopilot policy gates deny unsafe mutation by default and targeted policy tests pass.
</done>
<acceptance_criteria>
- `src/policy/autopilot-policy.ts` contains `export function isMutationBlocked`.
- `src/policy/autopilot-policy.ts` contains `export function isActionAllowed`.
- `src/policy/autopilot-policy.ts` contains `policy.emergencyStop`.
- `src/policy/autopilot-policy.ts` contains `merge_pr`.
- `src/policy/autopilot-policy.ts` contains `rollback`.
- `src/policy/autopilot-policy.ts` contains `run_recovery_hook`.
- `src/policy/autopilot-policy.ts` contains `allowRecoveryHook`.
- `tests/autopilot-policy.test.ts` contains `emergencyStop`.
- `tests/autopilot-policy.test.ts` contains `confidenceThreshold`.
- `tests/autopilot-policy.test.ts` contains `protectedPaths`.
- `tests/autopilot-policy.test.ts` contains `allowRecoveryHook`.
</acceptance_criteria>
</task>

</tasks>

<verification>
Run:
- `npm run typecheck`
- `npm run lint`
- `npm test`
</verification>

<must_haves>
- Provider config is typed and loaded from documented environment variables.
- Secret access goes through `loadConfig(secretStore, env)` and the `SecretStore` interface.
- Redaction helper masks secret values and sensitive keys.
- Autopilot policy defaults and helper functions deny unsafe mutation by default.
</must_haves>

<success_criteria>
- Config tests prove missing provider values fail loudly.
- Policy tests prove emergency stop and dry-run block mutation.
- Redaction tests prove tokens and private keys are not emitted raw.
</success_criteria>
