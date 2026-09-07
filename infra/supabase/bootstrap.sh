#!/usr/bin/env bash
# Bootstrap Supabase self-hosted into infra/supabase/
# Clones the pinned official docker-compose release and copies the required files.
# Re-runnable: re-running updates to the pinned SUPABASE_REF.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR=$(mktemp -d)
SUPABASE_REPO="https://github.com/supabase/supabase.git"
# Pinned for reproducibility: an unpinned ref (e.g. "master") can pull a different
# stack on every bootstrap run. Override with SUPABASE_REF=<tag|branch|sha> if needed.
SUPABASE_REF="${SUPABASE_REF:-v1.26.08}"

echo "📦 Bootstrapping Supabase self-hosted from ${SUPABASE_REPO}@${SUPABASE_REF}..."

git clone --depth 1 --branch "${SUPABASE_REF}" "${SUPABASE_REPO}" "${TEMP_DIR}/supabase" 2>&1 | tail -5

echo "📂 Copying docker/ contents to ${SCRIPT_DIR}..."
# Copy everything except .env (we manage that ourselves)
rsync -av \
  --exclude='.env' \
  --exclude='.env.example' \
  --exclude='docker-compose.override.yml' \
  --exclude='volumes/db/data' \
  --exclude='volumes/storage' \
  "${TEMP_DIR}/supabase/docker/" \
  "${SCRIPT_DIR}/"

# Copy .env.example as reference if not present
if [ ! -f "${SCRIPT_DIR}/env.example" ]; then
  cp "${TEMP_DIR}/supabase/docker/.env.example" "${SCRIPT_DIR}/env.example"
  echo "✅ Created ${SCRIPT_DIR}/env.example — copy it to .env and customize"
fi

rm -rf "${TEMP_DIR}"

echo ""
echo "✅ Supabase bootstrap done."
echo ""
echo "Next steps:"
echo "  1. cd ${SCRIPT_DIR}"
echo "  2. cp env.example .env"
echo "  3. Edit .env with your own POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY"
echo "     (use 'pnpm gen:keys' from repo root to generate them)"
echo "  4. docker compose up -d"
echo ""
echo "Services will be available at:"
echo "  - Postgres (direct, via docker-compose.override.yml): localhost:5433"
echo "    (this is what DATABASE_URL should point to for Drizzle DDL/migrations)"
echo "  - Postgres (Supavisor pooler): localhost:5432"
echo "  - Kong (API):    localhost:8000"
echo "  - Studio:        localhost:3000"
echo "  - GoTrue (Auth): localhost:9999 (via Kong: localhost:8000/auth/v1)"
