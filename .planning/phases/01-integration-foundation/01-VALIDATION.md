# Phase 1: Integration Foundation - Validation Strategy

**Phase:** 1
**Date:** 2026-04-25
**Applies to:** Integration Foundation

## Validation Architecture

Phase 1 validation must prove that the foundation can be configured and validated without mutating production.

## Required Checks

### Static Checks

- `npm run typecheck` exits 0.
- `npm run lint` exits 0.
- `npm test` exits 0.

### Config Tests

- Missing required Sentry config produces a validation error naming the missing key.
- Missing required GitHub config produces a validation error naming the missing key.
- Missing required Vercel config produces a validation error naming the missing key.
- Valid env input produces typed provider config.
- `.env.example` contains every required public key name with placeholder values only.

### Secret Tests

- `EnvSecretStore.require(name)` returns the value when present.
- `EnvSecretStore.require(name)` throws an error containing the missing secret name when absent.
- Redaction replaces configured secret values with `[REDACTED]`.
- Redaction removes common sensitive keys such as `token`, `secret`, `authorization`, `password`, and `private_key`.

### Policy Tests

- Default policy has `enabled=false`, `dryRun=true`, and all production mutation toggles disabled.
- `emergencyStop=true` blocks every mutation action.
- Actions not listed in `allowedActions` are denied.
- Confidence lower than `confidenceThreshold` is denied.
- Paths matching `protectedPaths` are denied.
- Merge, deploy, rollback, redeploy, and recovery hooks are denied until their explicit toggles allow them.
- `run_recovery_hook` is denied unless `allowRecoveryHook` is true.

### Provider Validation Tests

- Sentry validation client reports `ok=true` for a mocked project retrieval response.
- Sentry validation client reports `ok=false` and a stable error code for unauthorized or missing project responses.
- GitHub validation client creates an installation token through a mocked app flow and retrieves repository metadata.
- GitHub validation client reports missing permissions when mocked permissions do not include required read access.
- GitHub validation client returns `github_missing_permissions` and `missingScopes: ['metadata']` when mocked repository permissions explicitly deny metadata access.
- Vercel validation client retrieves production deployment metadata through a mocked project/team-scoped request.
- Vercel validation client reports wrong-team or unauthorized responses without leaking token values.

### No-Mutation Tests

- Phase 1 provider validation does not call GitHub issue, branch, pull request, contents write, merge, deployment mutation, rollback, redeploy, or hook endpoints.
- The validation command is safe to run repeatedly.

## Manual Verification

With real credentials configured locally, `npm run validate:config` should print a structured provider validation summary:

- `provider: sentry`, `ok: true`
- `provider: github`, `ok: true`
- `provider: vercel`, `ok: true`

The command must not print raw tokens, private keys, webhook secrets, or authorization headers.

## Acceptance

Phase 1 can be marked complete only when:

- All static checks pass.
- Unit tests pass without real external credentials.
- Manual validation command exists and is documented.
- Provider clients expose read-only validation methods only.
- Mutation methods are not implemented in Phase 1.
