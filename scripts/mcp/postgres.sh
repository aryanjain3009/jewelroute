#!/usr/bin/env bash
# Postgres MCP Pro (crystaldba postgres-mcp 0.3.0) for Claude Code, restricted mode, local databases only.
#   DATABASE_URI  connection string (from JR_AGENT_DATABASE_URI via .mcp.json; never commit it)
#   JR_MCP_DRY_RUN=1  validate and print what would run, without starting the server (used by pnpm harness:test)
# Restricted mode = read-only transactions + statement timeout. It is the only access mode we allow: the upstream
# README snippets all say --access-mode=unrestricted, so never copy them.
set -euo pipefail

uri="${DATABASE_URI:?DATABASE_URI is not set. Export JR_AGENT_DATABASE_URI=postgresql://USER:PASS@127.0.0.1:5432/jewelroute in your shell}"

case "$uri" in
  postgres://*|postgresql://*) ;;
  *) echo "postgres.sh: refusing: DATABASE_URI must be a postgres:// or postgresql:// URL" >&2; exit 64 ;;
esac

# authority = text between "://" and the first / ? #; host = after the last "@", before ":port"
rest="${uri#*://}"
authority="${rest%%[/?#]*}"
hostport="${authority##*@}"
if [[ "$hostport" == \[* ]]; then host="${hostport%%]*}]"; else host="${hostport%%:*}"; fi
host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"

case "$host" in
  localhost|127.0.0.1|::1|\[::1\]|db|postgres|host.docker.internal) ;;
  *) echo "postgres.sh: refusing non-local database host '$host'. Agents only inspect the local Postgres (docs/brain/learnings.md L0002)." >&2; exit 65 ;;
esac

# Query-string overrides could point libpq somewhere else.
if [[ "$uri" == *"host="* || "$uri" == *"hostaddr="* ]]; then
  echo "postgres.sh: refusing: host/hostaddr query parameters are not allowed" >&2; exit 65
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cmd=(uvx --overrides "$here/postgres-mcp.overrides.txt" postgres-mcp@0.3.0 --access-mode=restricted)
if [[ "${JR_MCP_DRY_RUN:-}" == "1" ]]; then
  echo "postgres.sh: ok host=$host would exec: ${cmd[*]}"
  exit 0
fi
export DATABASE_URI="$uri"
exec "${cmd[@]}"
