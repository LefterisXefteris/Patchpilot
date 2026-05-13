# Changelog

## v0.1.0-alpha

Patchpilot can now demonstrate the core production recovery loop:

- Watch Sentry-created GitHub issues for production incidents.
- Dispatch a constrained repair worker through GitHub Actions.
- Open draft PRs instead of merging automatically.
- Verify recovery through Vercel deployment state, HTTP health checks, and Sentry quieting.
- Detect Sentry performance bottlenecks from spans/transactions and create optimization work.
- Store compact incident memory and suspect-file hints for future diagnoses.
- Keep autonomous behavior policy-gated, redacted, and auditable.

Important PRs:

- [Add Sentry performance bottleneck recovery](https://github.com/LefterisXefteris/Patchpilot/pull/2)
- [Rename app to Patchpilot](https://github.com/LefterisXefteris/Patchpilot/pull/3)
