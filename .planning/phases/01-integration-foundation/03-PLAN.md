---
phase: 1
plan: 3
title: "Read-Only Provider Validation Adapters"
type: execute
wave: 3
depends_on:
  - 1
  - 2
files_modified:
  - src/providers/sentry/client.ts
  - src/providers/github/client.ts
  - src/providers/vercel/client.ts
  - src/validation/validate-integrations.ts
  - src/index.ts
  - tests/sentry-client.test.ts
  - tests/github-client.test.ts
  - tests/vercel-client.test.ts
  - tests/validate-integrations.test.ts
  - tests/validate-config-cli.test.ts
autonomous: true
requirements:
  - CONF-01
  - CONF-02
  - CONF-03
  - CONF-04
must_haves:
  truths:
    - "Sentry, GitHub, and Vercel validation adapters are read-only."
    - "validate-config aggregates provider validation through one command."
    - "Provider validation errors are structured and redacted."
  artifacts:
    - "src/providers/sentry/client.ts"
    - "src/providers/github/client.ts"
    - "src/providers/vercel/client.ts"
    - "src/validation/validate-integrations.ts"
    - "src/index.ts"
  key_links:
    - "src/index.ts validate-config -> loadConfigFromEnv -> validateIntegrations"
    - "src/validation/validate-integrations.ts -> SentryClient/GitHubClient/VercelClient validateAccess"
---

<objective>
Implement read-only validation clients for Sentry, GitHub, and Vercel, then wire them into the `validate-config` command so users can prove provider access without mutating production.
</objective>

<threat_model>
Assets: provider credentials, production repository/project identifiers, validation output.

Threats:
- Validation accidentally creates GitHub issues, branches, PRs, deployment mutations, rollback, or recovery hooks.
- Provider errors leak tokens, private keys, or authorization headers.
- Validation gives a false positive when the token can authenticate but cannot access the configured project/repository.

Mitigations in this plan:
- Provider adapters expose read-only `validateAccess` methods only.
- Tests assert no mutation endpoint methods are called.
- Error output passes through redaction.
- Validation checks configured project/repository/deployment metadata instead of only checking token format.
</threat_model>

<tasks>

<task id="3.1" type="execute">
<title>Implement Sentry read-only validation client</title>
<read_first>
- src/config/schema.ts
- src/security/redact.ts
- src/types/integration-validation.ts
- .planning/phases/01-integration-foundation/01-RESEARCH.md
</read_first>
<files>
- src/providers/sentry/client.ts
- tests/sentry-client.test.ts
</files>
<action>
Create `src/providers/sentry/client.ts` exporting:
- `export type FetchLike = typeof fetch;`
- `export class SentryClient`
- constructor `constructor(private readonly config: AppConfig['sentry'], private readonly fetchImpl: FetchLike = fetch) {}`
- method `async validateAccess(): Promise<IntegrationValidationResult>`

`validateAccess` must call:
`GET ${regionUrl}/api/0/projects/${orgSlug}/${projectSlug}/`
with header `Authorization: Bearer ${authToken}`.

On HTTP 2xx, return:
- `provider: 'sentry'`
- `ok: true`
- `checkedAt` ISO string
- `details` containing `orgSlug`, `projectSlug`, `environment`, and `hasAccess: true`

On non-2xx or thrown error, return:
- `provider: 'sentry'`
- `ok: false`
- `errorCode` as `sentry_http_${status}` or `sentry_request_failed`
- redacted `errorMessage`

Create `tests/sentry-client.test.ts` with mocked fetch success, unauthorized failure, thrown network error, and assertion that request method is `GET`.
</action>
<verify>
- `grep -F "class SentryClient" src/providers/sentry/client.ts`
- `grep -F "/api/0/projects/" src/providers/sentry/client.ts`
- `grep -F "Authorization" src/providers/sentry/client.ts`
- `npm test -- tests/sentry-client.test.ts`
</verify>
<automated>true</automated>
<done>
Done when Sentry read-only project validation is implemented and tested with mocked fetch responses.
</done>
<acceptance_criteria>
- `src/providers/sentry/client.ts` contains `class SentryClient`.
- `src/providers/sentry/client.ts` contains `/api/0/projects/`.
- `src/providers/sentry/client.ts` contains `Authorization`.
- `src/providers/sentry/client.ts` contains `validateAccess`.
- `tests/sentry-client.test.ts` contains `sentry_http_401`.
- `tests/sentry-client.test.ts` contains `method`.
- `tests/sentry-client.test.ts` contains `GET`.
</acceptance_criteria>
</task>

<task id="3.2" type="execute">
<title>Implement GitHub App read-only validation client</title>
<read_first>
- src/config/schema.ts
- src/security/redact.ts
- src/types/integration-validation.ts
- .planning/phases/01-integration-foundation/01-RESEARCH.md
</read_first>
<files>
- src/providers/github/client.ts
- tests/github-client.test.ts
</files>
<action>
Create `src/providers/github/client.ts` exporting:
- `export type GitHubValidationDependencies = { createInstallationToken: () => Promise<string>; getRepository: (token: string, owner: string, repo: string) => Promise<{ id: number; full_name: string; private: boolean; permissions?: Record<string, boolean>; }>; };`
- `export class GitHubClient`
- constructor `constructor(private readonly config: AppConfig['github'], private readonly deps?: GitHubValidationDependencies) {}`
- method `async validateAccess(): Promise<IntegrationValidationResult>`

Default dependency implementation should use `@octokit/auth-app` to create an installation token and `@octokit/rest` to call `repos.get({ owner, repo })`.

Validation returns `ok=true` only when repository metadata is returned. Details should include `owner`, `repo`, `fullName`, `repositoryId`, and booleans for visible permissions if present.

Define `REQUIRED_GITHUB_REPOSITORY_PERMISSIONS` as:
- `metadata: true`

If repository metadata includes a `permissions` object and `permissions.metadata !== true`, return `ok=false`, `missingScopes: ['metadata']`, and `errorCode: 'github_missing_permissions'`.

On error, return `ok=false` with `errorCode: 'github_request_failed'` and redacted `errorMessage`.

Do not add methods for issue creation, branch creation, content writes, PR creation, checks mutation, or merge.

Create `tests/github-client.test.ts` with mocked dependencies for success, insufficient `metadata` permission, absent permission details, and thrown error. Include a test that the class prototype has no `createIssue`, `createBranch`, `openPullRequest`, or `mergePullRequest` function.
</action>
<verify>
- `grep -F "class GitHubClient" src/providers/github/client.ts`
- `grep -F "REQUIRED_GITHUB_REPOSITORY_PERMISSIONS" src/providers/github/client.ts`
- `grep -F "github_missing_permissions" src/providers/github/client.ts`
- `npm test -- tests/github-client.test.ts`
</verify>
<automated>true</automated>
<done>
Done when GitHub App installation validation is read-only and tests cover success, missing metadata permission, and absence of mutation methods.
</done>
<acceptance_criteria>
- `src/providers/github/client.ts` contains `class GitHubClient`.
- `src/providers/github/client.ts` contains `REQUIRED_GITHUB_REPOSITORY_PERMISSIONS`.
- `src/providers/github/client.ts` contains `github_missing_permissions`.
- `src/providers/github/client.ts` contains `missingScopes`.
- `src/providers/github/client.ts` contains `createInstallationToken`.
- `src/providers/github/client.ts` contains `repos.get`.
- `src/providers/github/client.ts` contains `validateAccess`.
- `tests/github-client.test.ts` contains `github_missing_permissions`.
- `tests/github-client.test.ts` contains `metadata`.
- `tests/github-client.test.ts` contains `github_request_failed`.
- `tests/github-client.test.ts` contains `createIssue`.
- `tests/github-client.test.ts` contains `mergePullRequest`.
</acceptance_criteria>
</task>

<task id="3.3" type="execute">
<title>Implement Vercel read-only validation client</title>
<read_first>
- src/config/schema.ts
- src/security/redact.ts
- src/types/integration-validation.ts
- .planning/phases/01-integration-foundation/01-RESEARCH.md
</read_first>
<files>
- src/providers/vercel/client.ts
- tests/vercel-client.test.ts
</files>
<action>
Create `src/providers/vercel/client.ts` exporting:
- `export type VercelValidationDependencies = { listDeployments: (params: { token: string; teamId?: string; projectId: string; }) => Promise<{ deployments: Array<{ uid: string; url?: string; state?: string; target?: string; createdAt?: number; }> }>; };`
- `export class VercelClient`
- constructor `constructor(private readonly config: AppConfig['vercel'], private readonly deps?: VercelValidationDependencies) {}`
- method `async validateAccess(): Promise<IntegrationValidationResult>`

Phase 1 requires `VERCEL_TEAM_ID` when the Vercel project belongs to a team. `VERCEL_TEAM_SLUG` is stored as display/context only and must not be used for API scoping in Phase 1. Add schema/env validation guidance so a configured `teamSlug` without `teamId` emits a warning detail in validation results, not a false assumption that slug scoping is active.

Default dependency implementation should call the Vercel REST API endpoint for listing deployments with query params:
- `projectId`
- `target=production`
- `limit=1`
- `teamId` when configured

Validation returns `ok=true` when the response returns a deployments array. Details should include `projectId`, `teamId`, `teamSlug`, `teamSlugUsedForApi: false`, `deploymentVisible`, and `latestDeploymentState`.

On error, return `ok=false` with `errorCode: 'vercel_request_failed'` and redacted `errorMessage`.

Do not add rollback, redeploy, promotion, delete, or environment mutation methods.

Create `tests/vercel-client.test.ts` with mocked dependency success, empty deployment list success, thrown unauthorized error, and assertion that class prototype has no `rollback`, `redeploy`, or `promote` function.
</action>
<verify>
- `grep -F "class VercelClient" src/providers/vercel/client.ts`
- `grep -F "target=production" src/providers/vercel/client.ts`
- `grep -F "teamSlugUsedForApi: false" src/providers/vercel/client.ts`
- `npm test -- tests/vercel-client.test.ts`
</verify>
<automated>true</automated>
<done>
Done when Vercel deployment metadata validation is read-only and tests prove rollback/redeploy/promote methods do not exist.
</done>
<acceptance_criteria>
- `src/providers/vercel/client.ts` contains `class VercelClient`.
- `src/providers/vercel/client.ts` contains `target=production`.
- `src/providers/vercel/client.ts` contains `limit=1`.
- `src/providers/vercel/client.ts` contains `teamSlugUsedForApi: false`.
- `src/providers/vercel/client.ts` contains `validateAccess`.
- `tests/vercel-client.test.ts` contains `vercel_request_failed`.
- `tests/vercel-client.test.ts` contains `rollback`.
- `tests/vercel-client.test.ts` contains `redeploy`.
</acceptance_criteria>
</task>

<task id="3.4" type="execute">
<title>Wire provider validation command</title>
<read_first>
- src/index.ts
- src/config/env.ts
- src/secrets/env-secret-store.ts
- src/providers/sentry/client.ts
- src/providers/github/client.ts
- src/providers/vercel/client.ts
- src/security/redact.ts
- src/types/integration-validation.ts
</read_first>
<files>
- src/validation/validate-integrations.ts
- src/index.ts
- tests/validate-integrations.test.ts
- tests/validate-config-cli.test.ts
</files>
<action>
Create `src/validation/validate-integrations.ts` exporting:
- `async function validateIntegrations(config: AppConfig): Promise<ValidationSummary>`

It must instantiate `SentryClient`, `GitHubClient`, and `VercelClient`, call `validateAccess` on all three, and return `{ ok: results.every((result) => result.ok), results }`.

Update `src/index.ts` so `validate-config`:
- calls `loadConfigFromEnv(process.env)`
- awaits `loadConfigFromEnv(process.env)`
- therefore routes secret env reads through `EnvSecretStore` via `loadConfig`
- calls `validateIntegrations(config)`
- prints `JSON.stringify(summary, null, 2)`
- sets exit code `0` if `summary.ok` is true, else `1`
- catches thrown config errors, prints a redacted JSON error object with `{ ok: false, errorCode: 'config_invalid', errorMessage }`, and returns `1`

Create tests:
- `tests/validate-integrations.test.ts` for summary aggregation.
- `tests/validate-config-cli.test.ts` for invalid config returning exit code `1` and redacted output.
</action>
<verify>
- `grep -F "results.every" src/validation/validate-integrations.ts`
- `grep -F "await loadConfigFromEnv(process.env)" src/index.ts`
- `grep -F "config_invalid" src/index.ts`
- `npm test -- tests/validate-integrations.test.ts tests/validate-config-cli.test.ts`
</verify>
<automated>true</automated>
<done>
Done when `validate-config` awaits async config loading, aggregates read-only provider validations, redacts config errors, and targeted tests pass.
</done>
<acceptance_criteria>
- `src/validation/validate-integrations.ts` contains `results.every`.
- `src/validation/validate-integrations.ts` contains `new SentryClient`.
- `src/validation/validate-integrations.ts` contains `new GitHubClient`.
- `src/validation/validate-integrations.ts` contains `new VercelClient`.
- `src/index.ts` contains `config_invalid`.
- `src/index.ts` contains `await loadConfigFromEnv(process.env)`.
- `src/index.ts` contains `validateIntegrations`.
- `tests/validate-integrations.test.ts` contains `ok: false`.
- `tests/validate-config-cli.test.ts` contains `config_invalid`.
</acceptance_criteria>
</task>

</tasks>

<verification>
Run:
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run validate:config` with no real env vars and confirm it exits non-zero with `errorCode` equal to `config_invalid`.
</verification>

<must_haves>
- Provider validation clients are read-only.
- Validation probes check real configured provider access when credentials exist.
- Validation output is structured and redacted.
- `validate-config` returns success only when Sentry, GitHub, and Vercel validation all pass.
</must_haves>

<success_criteria>
- Tests prove no mutation methods exist on provider validation clients.
- Tests prove provider errors produce stable error codes.
- CLI invalid-config output does not leak configured secret-like values.
</success_criteria>
