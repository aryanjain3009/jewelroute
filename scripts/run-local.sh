#!/usr/bin/env bash
# JewelRoute — one-command local run (macOS / Linux).
#
#   ./scripts/run-local.sh            dev mode (hot reload)
#   ./scripts/run-local.sh --prod     production build of the web app (faster pages, best for demos)
#
# Needs Node 22+. Postgres is found or provided automatically, in this order:
#   1. DATABASE_URL you pass in            (e.g. DATABASE_URL=postgresql://me@127.0.0.1:5432/jewelroute ./scripts/run-local.sh)
#   2. a Postgres already listening on :5432 (Postgres.app, Homebrew, …) — uses your OS user
#   3. Docker (docker compose up db)
#   4. Homebrew: installs + starts postgresql@16
# Ports: API_PORT (4000) and WEB_PORT (3000) can be overridden.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"
MODE="dev"; [ "${1:-}" = "--prod" ] && MODE="prod"
say() { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }
die() { printf "\n\033[31m✗ %s\033[0m\n" "$*"; exit 1; }

say "Checking tools"
command -v node >/dev/null || die "Node.js 22+ is required (https://nodejs.org or: brew install node@22)"
node -v | grep -qE '^v(2[2-9]|[3-9][0-9])' || die "Node 22+ required, found $(node -v) (nvm install 22 && nvm use 22)"
if ! command -v pnpm >/dev/null; then corepack enable >/dev/null 2>&1 || npm i -g pnpm@10 >/dev/null; fi
echo "node $(node -v) · pnpm $(pnpm -v)"

# ---------- Postgres ----------
pg_up() { (command -v pg_isready >/dev/null && pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1) || (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; }
brew_pg_bin() { command -v brew >/dev/null && [ -d "$(brew --prefix)/opt/postgresql@16/bin" ] && echo "$(brew --prefix)/opt/postgresql@16/bin"; }
[ -n "$(brew_pg_bin || true)" ] && export PATH="$(brew_pg_bin):$PATH"

if [ -n "${DATABASE_URL:-}" ]; then
  DB_URL="$DATABASE_URL"; say "Using DATABASE_URL you provided"
elif pg_up; then
  DB_URL="postgresql://$(whoami)@127.0.0.1:5432/jewelroute"; say "Found Postgres on :5432 — using role $(whoami)"
  createdb -w -h 127.0.0.1 jewelroute </dev/null 2>/dev/null || true
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  say "Starting Postgres 16 in Docker"
  docker compose up -d db
  for _ in $(seq 1 40); do docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  DB_URL="postgresql://postgres:postgres@127.0.0.1:5432/jewelroute"
elif command -v brew >/dev/null; then
  say "Installing Postgres 16 with Homebrew (one time, ~1–2 min)"
  brew list postgresql@16 >/dev/null 2>&1 || brew install postgresql@16
  brew services start postgresql@16
  export PATH="$(brew --prefix)/opt/postgresql@16/bin:$PATH"
  for _ in $(seq 1 40); do pg_up && break; sleep 1; done
  pg_up || die "Postgres didn't start. Try: brew services restart postgresql@16"
  createdb -w -h 127.0.0.1 jewelroute </dev/null 2>/dev/null || true
  DB_URL="postgresql://$(whoami)@127.0.0.1:5432/jewelroute"
else
  die "No Postgres found. Install one of: Postgres.app (https://postgresapp.com), Docker Desktop, or Homebrew (then rerun)."
fi

# ---------- env files ----------
ENV=apps/api/.env
current_db=$( [ -f "$ENV" ] && grep '^DATABASE_URL=' "$ENV" | cut -d= -f2- || true )
if [ ! -f "$ENV" ] || [ "$current_db" != "$DB_URL" ] || ! grep -q "^API_PUBLIC_URL=http://localhost:$API_PORT$" "$ENV"; then
  say "Writing $ENV (fresh local secrets)"
  rnd() { node -e "console.log(require('crypto').randomBytes($1).toString('$2'))"; }
  sed -e "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" -e "s|^DATABASE_URL_DIRECT=.*|DATABASE_URL_DIRECT=$DB_URL|" \
      -e "s|^PORT=.*|PORT=$API_PORT|" \
      -e "s|^APP_PUBLIC_URL=.*|APP_PUBLIC_URL=http://localhost:$WEB_PORT|" \
      -e "s|^API_PUBLIC_URL=.*|API_PUBLIC_URL=http://localhost:$API_PORT|" \
      -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://localhost:$WEB_PORT|" \
      -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(rnd 32 hex)|" -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(rnd 32 hex)|" \
      -e "s|^APP_SECRET=.*|APP_SECRET=$(rnd 32 hex)|" -e "s|^CRON_SECRET=.*|CRON_SECRET=$(rnd 16 hex)|" \
      -e "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$(rnd 32 base64)|" apps/api/.env.example > "$ENV"
fi
echo "API_ORIGIN=http://localhost:$API_PORT" > apps/web/.env.local

# ---------- build ----------
say "Installing dependencies"
pnpm install --frozen-lockfile

say "Building the API and applying database migrations"
pnpm --filter @jewelroute/api build
( cd apps/api && npx prisma migrate deploy )
# Activity refs on older outbox rows (idempotent, 1k rows per batch; no-op when nothing is missing).
pnpm --filter @jewelroute/api db:backfill-activity-refs

if [ "$MODE" = "prod" ]; then
  say "Building the web app (production)"
  pnpm --filter @jewelroute/web build
fi

# ---------- run ----------
API_PID=""; WEB_PID=""
cleanup() { [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null; [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null; true; }
trap cleanup EXIT INT TERM

port_busy() { curl -s -o /dev/null -m 2 "localhost:$1" && return 0; (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
port_busy "$API_PORT" && die "Port $API_PORT is already in use (an earlier run still open?). Stop it, or run with API_PORT=4100 WEB_PORT=3100."
port_busy "$WEB_PORT" && die "Port $WEB_PORT is already in use. Stop it, or run with WEB_PORT=3100."

say "Starting API on :$API_PORT (log: .api.log)"
( cd apps/api && PORT="$API_PORT" node dist/main.js > "$ROOT/.api.log" 2>&1 ) & API_PID=$!
for _ in $(seq 1 60); do curl -sf "localhost:$API_PORT/v1/health" >/dev/null && break; sleep 0.5; done
curl -sf "localhost:$API_PORT/v1/health" >/dev/null || { tail -20 "$ROOT/.api.log"; die "API didn't start (see .api.log)"; }

say "Loading the Aurum Jewels demo data"
CRON_SECRET=$(grep '^CRON_SECRET=' "$ENV" | cut -d= -f2-)
curl -sf -X POST "localhost:$API_PORT/v1/internal/seed" -H "x-cron-secret: $CRON_SECRET" >/dev/null && echo "demo data loaded"

say "Starting web on :$WEB_PORT"
if [ "$MODE" = "prod" ]; then
  ( cd apps/web && pnpm exec next start -p "$WEB_PORT" ) & WEB_PID=$!
else
  ( cd apps/web && pnpm exec next dev -p "$WEB_PORT" ) & WEB_PID=$!
fi
for _ in $(seq 1 60); do curl -s -o /dev/null "localhost:$WEB_PORT/login" && break; sleep 1; done

cat <<MSG

  JewelRoute is running
  ─────────────────────
  Landing          http://localhost:$WEB_PORT
  Sign in          http://localhost:$WEB_PORT/login   (one-tap demo buttons)
     Field agent   rahul@aurum.test / Rahul@2026   → /field/today   (try it at phone width)
     Manager       admin@aurum.test / Aurum@2026   → /admin
  API + Swagger    http://localhost:$API_PORT/docs
  28-step check    cd apps/api && BASE_URL=http://localhost:$API_PORT CRON_SECRET=\$(grep ^CRON_SECRET= .env | cut -d= -f2-) pnpm e2e
  Fresh demo data  curl -X POST localhost:$API_PORT/v1/internal/seed -H "x-cron-secret: \$(grep ^CRON_SECRET= apps/api/.env | cut -d= -f2-)"

  Away from Delhi? On Rahul's visit page use "Simulate arrival (demo)" — it is recorded as simulated, never as GPS-verified.
  First page loads in dev mode compile on demand (a few seconds); use --prod for a snappy demo.

  Ctrl+C stops everything.
MSG
wait "$WEB_PID"
