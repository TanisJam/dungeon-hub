#!/usr/bin/env bash
# Run the Playwright suite against a throwaway full stack.
#
#   scripts/e2e-stack.sh                       # every spec
#   scripts/e2e-stack.sh --project=chromium-public
#
# The 53 specs in apps/web/e2e need what their README asks a developer to start
# by hand in three terminals: Supabase, the API, and the web app. That is why
# they ran nowhere — not on a fresh clone and not in CI. This starts all three,
# runs Playwright, and tears everything down.
#
# It layers on scripts/test-stack.sh, which owns Postgres + GoTrue, the
# migrations and the compendium import. This file adds only the two app
# processes and the browser run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT=4000
WEB_PORT=3001

# Re-exec ourselves inside the database stack. The marker keeps the second pass
# from recursing: by then DATABASE_URL and the Supabase env are exported.
if [ "${DH_E2E_INNER:-}" != '1' ]; then
  exec env DH_E2E_INNER=1 "${REPO_ROOT}/scripts/test-stack.sh" "${BASH_SOURCE[0]}" "$@"
fi

# Refuse to start on top of a process already holding either port. A leftover API
# from an earlier run answers requests with that run's JWT secret, so tokens minted
# by the current stack are rejected as invalid — a 401 that looks like an auth bug
# and is really a stale process. Meanwhile the API this script starts dies of
# EADDRINUSE in a redirected log nobody reads. Fail loudly instead.
for port in "${API_PORT}" "${WEB_PORT}"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    exec 3>&-
    echo "❌ Port ${port} is already in use — stop that process first." >&2
    echo "   Likely a leftover from an interrupted run:" >&2
    echo "     pkill -f 'tsx src/index.ts'; pkill -f 'next dev -p ${WEB_PORT}'" >&2
    exit 1
  fi
done

API_PID=''
WEB_PID=''
cleanup() {
  # Both are started through pnpm, so the recorded PID is a wrapper and killing it
  # orphans the node process that actually holds the port. Match on the command
  # line as well, and verify the ports are free afterwards.
  [ -n "${WEB_PID}" ] && kill "${WEB_PID}" 2>/dev/null || true
  [ -n "${API_PID}" ] && kill "${API_PID}" 2>/dev/null || true
  pkill -f 'tsx src/index.ts' 2>/dev/null || true
  pkill -f "next dev -p ${WEB_PORT}" 2>/dev/null || true
  pkill -f 'next-server' 2>/dev/null || true
  wait 2>/dev/null || true
  for port in "${API_PORT}" "${WEB_PORT}"; do
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
      exec 3>&-
      echo "⚠️  Port ${port} is still held after cleanup — kill it before the next run." >&2
    fi
  done
}
trap cleanup EXIT

wait_for() {
  local url="$1" label="$2" tries="${3:-60}"
  for _ in $(seq 1 "${tries}"); do
    if curl -sf -o /dev/null "${url}"; then echo "   ${label} up"; return 0; fi
    sleep 2
  done
  echo "❌ ${label} never came up at ${url}" >&2
  return 1
}

# The seeded modifier definitions are read at character-sheet compute time; the
# sheet specs render blank without them.
echo "🌱 Seeding modifier definitions..."
pnpm --filter @dungeon-hub/api seed-modifier-definitions >/dev/null

echo "🚀 Starting the API on :${API_PORT}..."
PORT="${API_PORT}" HOST=127.0.0.1 \
  pnpm --filter @dungeon-hub/api exec tsx src/index.ts >/tmp/dh-e2e-api.log 2>&1 &
API_PID=$!
wait_for "http://127.0.0.1:${API_PORT}/api/v1/health" 'API'

# The fixture users (dm@dh.test, player1..3@dh.test) and their world, characters
# and campaign. e2e/fixture.setup.ts signs in as each and saves a storageState;
# without this seed it fails, and every spec in the fixture-dependent projects
# fails with it. Goes through the API, so it has to run after the API is up.
echo "🎲 Seeding the E2E fixture..."
API_BASE_URL="http://127.0.0.1:${API_PORT}" \
  pnpm --filter @dungeon-hub/api db:seed:e2e >/tmp/dh-e2e-seed.log 2>&1 ||
  { echo "❌ Fixture seed failed — see /tmp/dh-e2e-seed.log" >&2; tail -20 /tmp/dh-e2e-seed.log >&2; exit 1; }

# Next.js inlines NEXT_PUBLIC_* at build time; `next dev` reads them per request,
# so exporting them here is enough and no rebuild is needed.
export NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"
export NEXT_PUBLIC_API_URL="http://127.0.0.1:${API_PORT}"
export WEB_BASE_URL="http://127.0.0.1:${WEB_PORT}"

echo "🌐 Starting the web app on :${WEB_PORT}..."
pnpm --filter @dungeon-hub/web exec next dev -p "${WEB_PORT}" >/tmp/dh-e2e-web.log 2>&1 &
WEB_PID=$!
wait_for "http://127.0.0.1:${WEB_PORT}" 'web' 90

# next dev compiles each route on its first request — 3 to 20 seconds apiece. The
# specs were written against a server someone had already been clicking around in,
# so their timeouts assume warm routes: j6-gm-owner's J6A2, for instance, allows
# 15s + 15s + 30s of waits inside a 30-second test budget. On a cold server the
# first navigation alone eats the budget, and the test fails looking like a role
# bug rather than a compile.
#
# Requesting each route once first moves that cost out of the measured window. The
# alternative — running a production build — would be faster still, but /dev
# returns notFound() outside development and dev-catalog.public.spec.ts covers it.
echo "🔥 Warming routes (next dev compiles on first request)..."
for route in / /inicio /dashboard /personajes /characters/new /compendium /bitacora /mapa /campanas /mercado /herramientas /dev /dev/catalog/tokens /dev/catalog/components /dev/catalog/diagnostics; do
  curl -sf -o /dev/null --max-time 90 "http://127.0.0.1:${WEB_PORT}${route}" || true
done
echo "   routes warm"

echo "🎭 Running Playwright..."
pnpm --filter @dungeon-hub/web exec playwright test "$@"
