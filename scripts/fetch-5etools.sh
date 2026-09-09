#!/usr/bin/env bash
# Populate data/5etools/data/ from the upstream mirror.
#
# The dataset is not committed and is not a submodule, so a fresh clone cannot
# run `import:5etools`, the API integration suite, or the compendium-import
# integration tests. README.md described doing this by hand and called
# automating it open work; this is that automation.
#
# A blobless sparse clone pulls only the `data/` tree (~112 MB on disk) instead
# of the full ~1 GB source repository.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${REPO_ROOT}/data/5etools"
UPSTREAM="https://github.com/5etools-mirror-3/5etools-src.git"
# Pinned to a branch rather than a tag: the mirror does not tag releases. Override
# with FIVEETOOLS_REF=<branch|tag|sha> to reproduce an older dataset.
REF="${FIVEETOOLS_REF:-main}"

if [ -d "${DEST}/data" ] && [ -f "${DEST}/data/races.json" ]; then
  echo "✅ data/5etools/data already present — nothing to do."
  echo "   Delete it and re-run to refresh."
  exit 0
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

echo "📦 Fetching the 5etools dataset from ${UPSTREAM}@${REF}..."
git clone --depth 1 --branch "${REF}" --filter=blob:none --sparse \
  "${UPSTREAM}" "${TEMP_DIR}/src" 2>&1 | tail -2
git -C "${TEMP_DIR}/src" sparse-checkout set data >/dev/null

# reader.ts expects the standard layout: data/races.json, data/items.json,
# data/class/class-*.json, data/spells/, data/bestiary/, …
if [ ! -f "${TEMP_DIR}/src/data/races.json" ]; then
  echo "❌ Upstream layout changed: data/races.json is missing." >&2
  exit 1
fi

mkdir -p "${DEST}"
rm -rf "${DEST}/data"
cp -r "${TEMP_DIR}/src/data" "${DEST}/data"

echo "✅ Dataset installed at data/5etools/data ($(du -sh "${DEST}/data" | cut -f1))."
echo "   It is gitignored — nothing to commit."
