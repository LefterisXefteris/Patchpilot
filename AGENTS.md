# AGENTS.md

## Project

Patchpilot is an AI production recovery agent for Sentry + GitHub + Vercel. It detects production Sentry errors, keeps GitHub issues updated, diagnoses root cause, creates patch PRs, deploys through Vercel, verifies recovery, and uses rollback/redeploy/restart fallbacks when needed.

## Planning Source Of Truth

- Project context: `.planning/PROJECT.md`
- Requirements: `.planning/REQUIREMENTS.md`
- Roadmap: `.planning/ROADMAP.md`
- State: `.planning/STATE.md`
- Research: `.planning/research/SUMMARY.md`

Read these before planning or implementing a phase.

## Product Rules

- Patch-first recovery is the default path.
- Rollback, redeploy, and restart/recovery hooks are fallback actions.
- GitHub Issues are the visible incident record.
- Full autopilot is the product ambition, but production mutation must obey explicit policy.
- Every autonomous action needs evidence, confidence, and audit trail.
- Secrets and sensitive Sentry payload data must be redacted before being written to GitHub or logs.

## Engineering Rules

- Keep changes scoped to the active phase.
- Prefer least-privilege integration design for Sentry, GitHub, and Vercel.
- Treat provider APIs as external contracts; isolate them behind adapters.
- Add tests around incident deduplication, policy decisions, recovery decisions, and provider side effects.
- Never let test fixtures contain real tokens, Sentry payload secrets, customer data, or production identifiers.

## Next Step

Run `$gsd-plan-phase 1` to plan Integration Foundation.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
