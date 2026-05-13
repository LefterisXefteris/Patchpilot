---
phase: 1
plan: 1
title: "Scaffold TypeScript Service Foundation"
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - vitest.config.ts
  - eslint.config.js
  - .gitignore
  - .env.example
  - src/index.ts
  - src/types/integration-validation.ts
  - tests/smoke.test.ts
autonomous: true
requirements:
  - CONF-01
  - CONF-02
  - CONF-03
  - CONF-04
must_haves:
  truths:
    - "The repository has a runnable TypeScript Node service foundation."
    - "Secret-bearing env files are ignored while .env.example remains tracked."
    - "The validate-config command exists as the single validation entrypoint."
  artifacts:
    - "package.json"
    - "tsconfig.json"
    - ".env.example"
    - "src/index.ts"
    - "src/types/integration-validation.ts"
  key_links:
    - "package.json scripts.validate:config -> src/index.ts main(['validate-config'])"
    - ".env.example provider keys -> later config schema"
---

<objective>
Create the minimal TypeScript Node service foundation for Patchpilot, including scripts, env documentation, source directories, test harness, and safety defaults for a credentials-heavy integration agent.
</objective>

<threat_model>
Assets: Sentry auth token, GitHub App private key, GitHub installation token, Vercel token, webhook secrets, production project identifiers.

Threats:
- Real secrets committed to git through `.env` files.
- Validation output or test snapshots exposing tokens or private keys.
- Later phases adding provider mutation before the project has policy gates.

Mitigations in this plan:
- Add `.gitignore` entries for `.env` and `.env.*` while keeping `.env.example`.
- Use placeholder-only values in `.env.example`.
- Scaffold validation result types without mutation methods.
- Add a smoke test proving the test harness works before provider logic is added.
</threat_model>

<tasks>

<task id="1.1" type="execute">
<title>Create Node/TypeScript project scripts and compiler configuration</title>
<read_first>
- AGENTS.md
- .planning/phases/01-integration-foundation/01-RESEARCH.md
- .planning/phases/01-integration-foundation/01-VALIDATION.md
</read_first>
<files>
- package.json
- tsconfig.json
- vitest.config.ts
- eslint.config.js
</files>
<action>
Create `package.json` with:
- `"name": "patchpilot"`
- `"version": "0.1.0"`
- `"type": "module"`
- scripts:
  - `"build": "tsc -p tsconfig.json"`
  - `"typecheck": "tsc --noEmit -p tsconfig.json"`
  - `"lint": "eslint ."`
  - `"test": "vitest run"`
  - `"validate:config": "tsx src/index.ts validate-config"`
- dependencies:
  - `"@octokit/auth-app": "^7.0.0"`
  - `"@octokit/rest": "^21.0.2"`
  - `"@vercel/sdk": "^1.10.0"`
  - `"zod": "^3.24.1"`
- devDependencies:
  - `"@eslint/js": "^9.18.0"`
  - `"@types/node": "^22.10.7"`
  - `"eslint": "^9.18.0"`
  - `"tsx": "^4.19.2"`
  - `"typescript": "^5.7.3"`
  - `"typescript-eslint": "^8.20.0"`
  - `"vitest": "^2.1.8"`

Create `tsconfig.json` with `target` set to `ES2022`, `module` set to `NodeNext`, `moduleResolution` set to `NodeNext`, `strict` set to `true`, `rootDir` set to `"."`, and `include` covering `src/**/*.ts`, `tests/**/*.ts`, `vitest.config.ts`, and `eslint.config.js`.

Create `vitest.config.ts` with `test.environment` set to `"node"`.

Create `eslint.config.js` using `@eslint/js`, `typescript-eslint`, and Node globals for `.ts` files.
</action>
<verify>
- `test -f package.json`
- `test -f tsconfig.json`
- `test -f vitest.config.ts`
- `test -f eslint.config.js`
- `node -e "const p=require('./package.json'); if (p.scripts['validate:config'] !== 'tsx src/index.ts validate-config') process.exit(1)"`
</verify>
<automated>true</automated>
<done>
Done when project scripts and TypeScript/test/lint config files exist with the exact package names and scripts listed in acceptance criteria.
</done>
<acceptance_criteria>
- `package.json` contains `"validate:config": "tsx src/index.ts validate-config"`.
- `package.json` contains `"@octokit/auth-app": "^7.0.0"`.
- `package.json` contains `"@vercel/sdk": "^1.10.0"`.
- `package.json` contains `"zod": "^3.24.1"`.
- `tsconfig.json` contains `"strict": true`.
- `tsconfig.json` contains `"module": "NodeNext"`.
- `vitest.config.ts` contains `environment: 'node'`.
- `eslint.config.js` imports `typescript-eslint`.
</acceptance_criteria>
</task>

<task id="1.2" type="execute">
<title>Document required environment variables and prevent secret commits</title>
<read_first>
- AGENTS.md
- .planning/phases/01-integration-foundation/01-RESEARCH.md
</read_first>
<files>
- .gitignore
- .env.example
</files>
<action>
Create `.gitignore` containing:
- `node_modules/`
- `dist/`
- `.env`
- `.env.*`
- `!.env.example`
- `coverage/`

Create `.env.example` with placeholder-only values for:
- `NODE_ENV=development`
- `BTS_LOG_LEVEL=info`
- `BTS_DRY_RUN=true`
- `SENTRY_AUTH_TOKEN=sntrys_PLACEHOLDER`
- `SENTRY_ORG_SLUG=your-sentry-org`
- `SENTRY_PROJECT_SLUG=your-sentry-project`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_REGION_URL=https://sentry.io`
- `SENTRY_WEBHOOK_SECRET=placeholder-webhook-secret`
- `GITHUB_APP_ID=123456`
- `GITHUB_APP_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\nPLACEHOLDER\\n-----END PRIVATE KEY-----\"`
- `GITHUB_INSTALLATION_ID=12345678`
- `GITHUB_OWNER=your-org`
- `GITHUB_REPO=your-repo`
- `GITHUB_WEBHOOK_SECRET=placeholder-webhook-secret`
- `GITHUB_BASE_BRANCH=main`
- `VERCEL_TOKEN=vercel_PLACEHOLDER`
- `VERCEL_TEAM_ID=team_PLACEHOLDER`
- `VERCEL_TEAM_SLUG=your-team`
- `VERCEL_PROJECT_ID=prj_PLACEHOLDER`
- `VERCEL_PROJECT_NAME=your-project`
- `AUTOPILOT_ENABLED=false`
- `AUTOPILOT_DRY_RUN=true`
- `AUTOPILOT_CONFIDENCE_THRESHOLD=0.85`
- `AUTOPILOT_MAX_FILES_CHANGED=5`
- `AUTOPILOT_MAX_LINES_CHANGED=250`
- `AUTOPILOT_ALLOWED_ACTIONS=create_issue,update_issue,open_pr`
- `AUTOPILOT_PROTECTED_PATHS=.github/workflows/**,infra/**,prisma/**`
- `AUTOPILOT_ALLOW_MERGE=false`
- `AUTOPILOT_ALLOW_DEPLOY=false`
- `AUTOPILOT_ALLOW_ROLLBACK=false`
- `AUTOPILOT_ALLOW_RECOVERY_HOOK=false`
- `AUTOPILOT_EMERGENCY_STOP=false`
</action>
<verify>
- `grep -F ".env" .gitignore`
- `grep -F "!.env.example" .gitignore`
- `grep -F "SENTRY_AUTH_TOKEN=sntrys_PLACEHOLDER" .env.example`
- `grep -F "AUTOPILOT_ALLOW_RECOVERY_HOOK=false" .env.example`
</verify>
<automated>true</automated>
<done>
Done when `.gitignore` blocks real env files and `.env.example` documents every Phase 1 provider and policy key with placeholder values only.
</done>
<acceptance_criteria>
- `.gitignore` contains `.env`.
- `.gitignore` contains `.env.*`.
- `.gitignore` contains `!.env.example`.
- `.env.example` contains `SENTRY_AUTH_TOKEN=sntrys_PLACEHOLDER`.
- `.env.example` contains `GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nPLACEHOLDER\\n-----END PRIVATE KEY-----"`.
- `.env.example` contains `VERCEL_TOKEN=vercel_PLACEHOLDER`.
- `.env.example` contains `AUTOPILOT_CONFIDENCE_THRESHOLD=0.85`.
- `.env.example` contains `AUTOPILOT_ALLOW_RECOVERY_HOOK=false`.
- `.env.example` does not contain any non-placeholder real token values.
</acceptance_criteria>
</task>

<task id="1.3" type="execute">
<title>Create initial source and validation result type</title>
<read_first>
- AGENTS.md
- .planning/REQUIREMENTS.md
- .planning/phases/01-integration-foundation/01-RESEARCH.md
</read_first>
<files>
- src/types/integration-validation.ts
- src/index.ts
- tests/smoke.test.ts
</files>
<action>
Create `src/types/integration-validation.ts` exporting:
- `export type ProviderName = 'sentry' | 'github' | 'vercel';`
- `export type IntegrationValidationResult = { provider: ProviderName; ok: boolean; checkedAt: string; details: Record<string, string | number | boolean | null>; missingScopes?: string[]; errorCode?: string; errorMessage?: string; };`
- `export type ValidationSummary = { ok: boolean; results: IntegrationValidationResult[]; };`

Create `src/index.ts` exporting `main(argv = process.argv.slice(2))`. For now it must:
- If first arg is not `validate-config`, print `Usage: patchpilot validate-config` and return exit code `1`.
- If first arg is `validate-config`, print JSON with `{ "ok": true, "results": [] }` and return exit code `0`.
- If executed directly, call `main()` and set `process.exitCode`.

Create `tests/smoke.test.ts` with a Vitest test that calls `main(['validate-config'])` and expects return code `0`.
</action>
<verify>
- `grep -F "export type ProviderName = 'sentry' | 'github' | 'vercel';" src/types/integration-validation.ts`
- `grep -F "export async function main" src/index.ts`
- `grep -F "Usage: patchpilot validate-config" src/index.ts`
- `npm test -- tests/smoke.test.ts`
</verify>
<automated>true</automated>
<done>
Done when the validation result type, CLI entrypoint, and smoke test exist and the smoke test passes.
</done>
<acceptance_criteria>
- `src/types/integration-validation.ts` contains `export type ProviderName = 'sentry' | 'github' | 'vercel';`.
- `src/types/integration-validation.ts` contains `missingScopes?: string[]`.
- `src/index.ts` contains `Usage: patchpilot validate-config`.
- `src/index.ts` contains `export async function main`.
- `tests/smoke.test.ts` contains `expect(code).toBe(0)`.
- `tests/smoke.test.ts` imports `main` from `../src/index`.
</acceptance_criteria>
</task>

</tasks>

<verification>
Run:
- `npm install`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run validate:config`
</verification>

<must_haves>
- Project scripts exist for build, typecheck, lint, test, and validate:config.
- `.env.example` documents every Phase 1 provider and policy key with placeholders.
- `.gitignore` prevents `.env` secrets from being committed.
- The repository has a minimal TypeScript entrypoint and test harness.
</must_haves>

<success_criteria>
- `npm test` can execute the smoke test.
- `npm run validate:config` exists and returns a JSON validation summary.
- No provider mutation API is introduced in this plan.
</success_criteria>
