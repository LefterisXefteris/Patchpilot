# Honest Failure Documentation

Patchpilot is currently an assignment-grade production-agent demo, not a fully autonomous recovery system.

## Known Limitations

- The default eval path uses deterministic offline fixtures, not live Sentry, GitHub, Vercel, or Claude calls.
- `agent:run` records a real SQLite trace, but the LLM planner is represented by a deterministic local decision policy until a live model adapter is added.
- Claude Code is treated as a draft-PR worker only. The system intentionally does not auto-merge, deploy, rollback, or restart production.
- Sentry event parsing is simplified in the offline harness. Real stack-frame source mapping and release-to-commit correlation are future work.
- Cost tracking is estimated from serialized prompt/tool content, not provider billing receipts.
- SQLite persistence is implemented through the local `sqlite3` CLI to avoid native package setup. Environments without `sqlite3` need a package-backed adapter.
- Prompt ablation currently compares prompt variants through the same deterministic runner. It proves artifact plumbing, not model-quality differences.

## Failure Handling Policy

- Missing Sentry event details: create or update the GitHub incident issue, then return `create_issue` or `needs_human` instead of patching.
- Vercel API failure: continue the incident path and record the error in tool traces.
- Prompt injection or unsafe instructions inside incident data: return `needs_human`.
- Low-confidence or non-production issues: do not trigger Claude.
- Secrets in tool input/output: redact before writing SQLite traces, JSON logs, GitHub issues, or eval output.

