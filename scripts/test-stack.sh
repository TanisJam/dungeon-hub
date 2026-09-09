#!/usr/bin/env bash
# Run a command against a throwaway Postgres + GoTrue stack.
#
#   scripts/test-stack.sh pnpm --filter @dungeon-hub/api test
#
# Why this exists: 119 of the 126 files in apps/api/tests are integration tests
# that make real requests to GoTrue and real queries against Postgres. Without a
# stack they cannot run at all, which is why they ran nowhere — not locally on a
# fresh clone, and not in CI.
#
# The credentials below are fixed, fake, and local-only. They are derived at
# runtime rather than committed so that no JWT literal lives in the repository.
# The stack listens on 54321/54322 and is destroyed on exit, so it never touches
# a developer's real Supabase stack or its data.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="${REPO_ROOT}/infra/test"
COMPOSE_ARGS="-f ${COMPOSE_DIR}/docker-compose.yml -p dungeon-hub-test"
SUDO=""

# Some environments need sudo for the docker socket; prefer running without it.
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    SUDO="sudo -n --preserve-env=TEST_JWT_SECRET"
  else
    echo "❌ Cannot reach the Docker daemon (tried direct and sudo -n)." >&2
    exit 1
  fi
fi

# Obviously-fake secret. GoTrue signs with it, the API verifies with it, and the
# anon/service-role JWTs below are signed with it — all three must agree.
export TEST_JWT_SECRET='dungeon-hub-integration-test-secret-not-a-real-one'

# Built after the secret is exported: sudo resets the environment, so the
# variable has to be named on the sudo line for compose interpolation to see it.
COMPOSE="${SUDO} docker compose ${COMPOSE_ARGS}"

read -r TEST_ANON_KEY TEST_SERVICE_ROLE_KEY <<<"$(node -e '
const c = require("node:crypto");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (role, secret) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role, iss: "supabase", iat: now, exp: now + 3600 * 24 });
  const sig = c.createHmac("sha256", secret).update(head + "." + body).digest("base64url");
  return head + "." + body + "." + sig;
};
const s = process.env.TEST_JWT_SECRET;
console.log(sign("anon", s), sign("service_role", s));
')"

cleanup() {
  echo "🧹 Tearing the test stack down..."
  ${COMPOSE} down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A previous run killed hard (Ctrl-C, CI cancellation) leaves containers holding
# the ports. Tear down first so the script is safe to re-run.
${COMPOSE} down -v --remove-orphans >/dev/null 2>&1 || true

echo "🐳 Starting Postgres + GoTrue..."
${COMPOSE} up -d --wait

export DATABASE_URL='postgres://postgres:postgres@localhost:54322/postgres'
export SUPABASE_URL='http://localhost:54321'
export SUPABASE_JWT_SECRET="${TEST_JWT_SECRET}"
export SUPABASE_ANON_KEY="${TEST_ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${TEST_SERVICE_ROLE_KEY}"
export WEB_APP_URL='http://localhost:3000'
export NODE_ENV='test'

echo "🗃️  Applying Drizzle migrations..."
pnpm --filter @dungeon-hub/api exec drizzle-kit migrate >/dev/null

# The custom SQL is not part of the Drizzle journal and has to be applied after
# it: 0001 adds the FK to auth.users plus the signup mirror trigger the test
# helper depends on, 0002/0003 add NULLS NOT DISTINCT uniques Drizzle cannot
# express. Order matters — they assume the public tables already exist.
echo "🧩 Applying custom SQL..."
for sql in "${REPO_ROOT}"/apps/api/drizzle/custom/*.sql; do
  echo "   $(basename "$sql")"
  ${COMPOSE} exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q < "$sql"
done

# The integration suite builds characters out of real compendium rows (races,
# classes, backgrounds, items, spells), so an empty compendium fails ~260 tests
# with RACE_NOT_FOUND and friends rather than anything meaningful.
if [ -d "${REPO_ROOT}/data/5etools/data" ]; then
  echo "📚 Importing the 5etools compendium..."
  pnpm --filter @dungeon-hub/api import:5etools >/dev/null
else
  echo "⚠️  data/5etools/data is missing — see scripts/fetch-5etools.sh." >&2
  echo "    Continuing, but every test that needs compendium data will fail." >&2
fi

echo "✅ Stack ready. Running: $*"
echo ""
"$@"
