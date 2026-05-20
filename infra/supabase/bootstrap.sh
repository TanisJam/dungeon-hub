#!/usr/bin/env bash
# Bootstrap Supabase self-hosted en infra/supabase/
# Clona la versión oficial del docker-compose y copia los archivos necesarios.
# Re-ejecutable: actualiza al último release.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR=$(mktemp -d)
SUPABASE_REPO="https://github.com/supabase/supabase.git"
SUPABASE_REF="${SUPABASE_REF:-master}"

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
echo "  - Postgres:      localhost:5432"
echo "  - Kong (API):    localhost:8000"
echo "  - Studio:        localhost:3000"
echo "  - GoTrue (Auth): localhost:9999 (via Kong: localhost:8000/auth/v1)"
