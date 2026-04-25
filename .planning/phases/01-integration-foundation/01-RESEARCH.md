# Phase 1: Integration Foundation - Research

**Phase:** 1 - Integration Foundation
**Date:** 2026-04-25
**Status:** Ready for planning

## Research Goal

Plan the foundation for configuring and validating Sentry, GitHub, Vercel, secrets, and autopilot policy without mutating production.

## Phase Scope

Phase 1 covers:

- **CONF-01**: User can configure Sentry organization, project, environment, and authentication for production issue access.
- **CONF-02**: User can configure a GitHub repository through a least-privilege GitHub App or token.
- **CONF-03**: User can configure a Vercel project/team for deployment lookup, deployment monitoring, and rollback fallback.
- **CONF-04**: User can define autopilot policy including confidence threshold, protected paths, allowed actions, and emergency stop.

Phase 1 should not implement incident intake, PR creation, merge, deploy, rollback, or production recovery. It should create the app skeleton, configuration model, credential access pattern, provider clients, safe validation probes, and policy types that later phases build on.

## Official API Findings

### Sentry

- Sentry API calls use `Authorization: Bearer <token>`.
- Internal integrations can create organization-level auth tokens and are the best v1 starting point for one organization.
- OAuth2 and device authorization flows exist for later multi-user or headless onboarding.
- Sentry endpoint docs list required scopes per endpoint; Phase 1 validation should use read-only endpoints.
- `GET /api/0/projects/{organization_id_or_slug}/{project_id_or_slug}/` validates organization/project access with `project:read` or stronger.
- Issue event retrieval supports `latest`, `oldest`, and `recommended` event IDs and accepts `environment` filtering, but actual issue/event ingestion belongs to Phase 2.
- Alert-rule webhooks require a Sentry integration with a webhook URL and "Alert Rule Action" enabled; alert rules must send a notification via that integration.

### GitHub

- A GitHub App is the preferred v1 credential model because repository access and permissions are explicit and auditable.
- GitHub Apps authenticate as the app with a JWT, then create installation access tokens for repository operations.
- Installation access tokens expire after one hour and can be narrowed to specific repositories and permissions.
- Installation IDs can be obtained from webhook payloads or repository/org/user installation endpoints.
- Phase 1 should validate by fetching repository metadata and checking installation permissions, not by creating issues/branches/PRs yet.

### Vercel

- Vercel REST API and `@vercel/sdk` use access tokens as bearer tokens.
- Tokens must be scoped to the correct account/team, and 403 errors can mean expired token, wrong team/account scope, or unavailable operation.
- Deployment listing supports filtering by project, target environment, state, branch, SHA, and rollback candidacy.
- Vercel rollback is a fallback recovery mechanism with caveats: rolled-back configuration can be stale, environment variable changes do not apply to previous deployments, cron jobs revert with the rolled-back deployment, and plan level affects rollback eligibility.
- Phase 1 should validate by listing or retrieving project/deployment metadata only.

## Recommended Architecture

Use a small TypeScript service skeleton with isolated adapters:

- `src/config/schema.ts` - validates all app configuration and policy.
- `src/config/env.ts` - loads environment variables and converts them to typed config.
- `src/secrets/types.ts` - declares a `SecretStore` interface.
- `src/secrets/env-secret-store.ts` - v1 implementation reading secrets from process env.
- `src/policy/autopilot-policy.ts` - policy schema, defaults, validation, and helpers.
- `src/providers/sentry/client.ts` - Sentry read-only validation client.
- `src/providers/github/client.ts` - GitHub App validation client.
- `src/providers/vercel/client.ts` - Vercel read-only validation client.
- `src/validation/validate-integrations.ts` - runs all provider validation probes and returns structured results.
- `src/index.ts` - CLI or entrypoint that supports `validate-config`.

Keep provider clients behind small interfaces so later phases can mock API side effects and add incident workflows without coupling the domain logic to SDK details.

## Configuration Keys

Phase 1 should define these environment variables and policy fields.

### Runtime

- `NODE_ENV`
- `BTS_LOG_LEVEL`
- `BTS_DRY_RUN`

### Sentry

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG_SLUG`
- `SENTRY_PROJECT_SLUG`
- `SENTRY_ENVIRONMENT`
- `SENTRY_REGION_URL` (optional; default `https://sentry.io`)
- `SENTRY_WEBHOOK_SECRET` (optional in Phase 1, required before webhook intake)

### GitHub

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_INSTALLATION_ID`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_WEBHOOK_SECRET` (optional in Phase 1, required before webhook intake)
- `GITHUB_BASE_BRANCH` (default `main`)

### Vercel

- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID` or `VERCEL_TEAM_SLUG` (one of them optional depending on account)
- `VERCEL_PROJECT_ID`
- `VERCEL_PROJECT_NAME` (optional display value)

### Autopilot Policy

- `AUTOPILOT_ENABLED` (default `false` for first boot)
- `AUTOPILOT_DRY_RUN` (default `true`)
- `AUTOPILOT_CONFIDENCE_THRESHOLD` (default `0.85`)
- `AUTOPILOT_MAX_FILES_CHANGED` (default `5`)
- `AUTOPILOT_MAX_LINES_CHANGED` (default `250`)
- `AUTOPILOT_ALLOWED_ACTIONS` (comma-separated, e.g. `create_issue,open_pr`)
- `AUTOPILOT_PROTECTED_PATHS` (comma-separated globs, e.g. `.github/workflows/**,infra/**,prisma/**`)
- `AUTOPILOT_ALLOW_MERGE` (default `false` until Phase 5)
- `AUTOPILOT_ALLOW_DEPLOY` (default `false` until Phase 5)
- `AUTOPILOT_ALLOW_ROLLBACK` (default `false` until Phase 5)
- `AUTOPILOT_ALLOW_RECOVERY_HOOK` (default `false` until Phase 5+)
- `AUTOPILOT_EMERGENCY_STOP` (default `false`; when true, blocks all mutation)

## Validation Probes

Provider validation must be read-only in Phase 1:

- Sentry: call project retrieval for the configured organization/project and report `ok`, `project_id`, `project_slug`, `platform`, and `has_access`.
- GitHub: create an installation token, call repository metadata for `owner/repo`, and report selected permissions; do not create issues, refs, contents, PRs, or comments.
- Vercel: retrieve or list deployments for configured project with production target and small limit; report token/team/project access and whether any production deployment metadata is visible.

Validation output should be structured:

```ts
type IntegrationValidationResult = {
  provider: 'sentry' | 'github' | 'vercel';
  ok: boolean;
  checkedAt: string;
  details: Record<string, string | number | boolean | null>;
  missingScopes?: string[];
  errorCode?: string;
  errorMessage?: string;
};
```

## Secret Storage

For v1, use an environment-backed secret store and keep `.env.example` as documentation only. Do not commit real `.env` files. Add `.gitignore` entries for `.env`, `.env.*`, except `.env.example`.

The secret store interface should make future replacement easy:

```ts
interface SecretStore {
  get(name: string): Promise<string | undefined>;
  require(name: string): Promise<string>;
}
```

## Autopilot Policy Shape

Policy should be data-first and testable:

```ts
type RecoveryAction =
  | 'create_issue'
  | 'update_issue'
  | 'create_branch'
  | 'apply_patch'
  | 'open_pr'
  | 'merge_pr'
  | 'monitor_deployment'
  | 'redeploy'
  | 'rollback'
  | 'run_recovery_hook';

type AutopilotPolicy = {
  enabled: boolean;
  dryRun: boolean;
  emergencyStop: boolean;
  confidenceThreshold: number;
  maxFilesChanged: number;
  maxLinesChanged: number;
  allowedActions: RecoveryAction[];
  protectedPaths: string[];
  allowMerge: boolean;
  allowDeploy: boolean;
  allowRollback: boolean;
  allowRecoveryHook: boolean;
};
```

Phase 1 should include helper functions such as:

- `isMutationBlocked(policy)`
- `isActionAllowed(policy, action)`
- `isConfidenceAllowed(policy, confidence)`
- `isPathProtected(policy, filePath)`
- `validatePolicy(policy)`

## Security Threat Model

Important threats to plan against:

- Token leakage through logs, GitHub issue comments, PR bodies, error messages, or validation output.
- Over-broad GitHub permissions enabling unintended repository mutation.
- Sentry payloads containing PII or secrets that later phases might write to GitHub.
- Misconfigured Vercel team/project causing validation or recovery against the wrong production app.
- Autopilot accidentally enabled with mutation actions before later phases implement verification.
- Emergency stop not being enforced consistently across all provider actions.

Required mitigations in Phase 1:

- Central redaction helper for known secret values and sensitive key patterns.
- Read-only validation probes only.
- Explicit policy defaults that keep mutation disabled until later phases enable it intentionally.
- Unit tests for config validation, policy gating, protected paths, dry-run behavior, and redaction.
- `.env.example` with placeholders only.

## Validation Architecture

Phase 1 should be verified without real production mutation:

- Unit tests for configuration schema validation.
- Unit tests for environment loading with missing/invalid values.
- Unit tests for secret store behavior.
- Unit tests for autopilot policy defaults and gates.
- Unit tests for provider validation clients using mocked HTTP responses.
- A CLI command such as `npm run validate:config` that can run provider validation if real env vars are present, but tests should pass without real credentials.
- Static checks: typecheck, lint, test.

## Planning Implications

Recommended Phase 1 plans:

1. Scaffold the TypeScript service, test tooling, environment docs, and gitignore safety.
2. Implement config schema, secret store, redaction, and autopilot policy.
3. Implement read-only provider validation adapters and a validation command.

Keep merge/deploy/rollback permissions modeled but disabled. Later phases can expand the same provider clients with mutation methods once guardrails and audit are ready.

## RESEARCH COMPLETE
