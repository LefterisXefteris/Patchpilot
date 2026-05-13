# Contributing to Patchpilot

Patchpilot is an AI production recovery agent. Contributions should preserve the core promise: production signals become small, reviewed, auditable fixes.

## Local Setup

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Create `.env` from `.env.example` for live provider validation. Do not commit `.env`, tokens, Sentry payload secrets, customer data, or production identifiers beyond the documented demo configuration.

## Development Workflow

- Keep changes scoped to one behavior or integration path.
- Prefer provider adapters for Sentry, GitHub, and Vercel API changes.
- Add tests around intake, policy decisions, dispatch payloads, verification, and redaction.
- Keep production mutation policy-gated. Draft PRs are safe by default; merge, deploy, rollback, and recovery hooks require explicit policy.
- Update `README.md` or `docs/` when changing operator-facing behavior.

## Pull Request Checklist

- Tests, lint, typecheck, and build pass.
- New incident evidence written to GitHub is redacted.
- New autonomous actions include policy checks and audit-friendly output.
- Performance-related changes include threshold, sample-count, or baseline behavior tests.
- The PR explains user impact, risk, and verification.

## Useful Commands

```bash
npm run agent:watch -- --limit 5
npm run agent:performance -- --limit 5
npm run agent:recover -- --limit 5
npm run eval
```
