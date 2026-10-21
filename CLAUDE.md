@AGENTS.md

## Claude Code only
- **Skills** (`.claude/skills/`). You type: `/spec`, `/plan`, `/build`, `/verify`, `/ship`, `/recall`, `/remember`. The model loads: `tdd`, `money-math`, `write-migration`, `review-change`, `ui-verify`, `diagnosing-bugs`. The project `/verify` replaces Claude Code's bundled `/verify` on purpose.
- **Subagents** (`.claude/agents/`): `builder` (one task), `verifier` (fresh context, default REJECT), `invariant-reviewer`, `migration-reviewer`, `security-reviewer`, `ui-critic`. Reviewers cannot write files.
- **Path rules** (`.claude/rules/`) load when you touch matching files: migrations, money/custody code, the API, the web app. They also point you at the nested `apps/*/AGENTS.md`, which Claude Code does not load on its own while this `CLAUDE.md` exists.
- **Hooks** (`.claude/hooks/`, wired in `.claude/settings.json`): `session-start` prints memory and git state; `guard-bash` and `guard-write` block destructive commands, secrets and edits to applied migrations; `post-edit` marks packages dirty; `stop-verify` runs the affected checks before you stop. Tests: `pnpm harness:test`. Set `JR_SKIP_STOP_VERIFY=1` to switch the stop check off for one session.
- **MCP** (`.mcp.json`): `playwright` (headless, isolated, only `http://localhost:3000`) and `postgres` (Postgres MCP Pro, restricted mode, local hosts only through `scripts/mcp/postgres.sh`; needs `JR_AGENT_DATABASE_URI` in your shell).
