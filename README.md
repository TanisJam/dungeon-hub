# Dungeon Hub

A private D&D 5e (PHB 2014) companion for a West Marches campaign: a shared, persistent world played asynchronously by multiple DMs and players. The app covers character creation and management, a browsable rules compendium, a campaign map with waypoints, a world knowledge layer (lore, factions, NPCs, sessions), and a Discord bot that surfaces sheets and world data in-table. All UI is **mobile-first**; the backend is self-hosted with Supabase + Postgres.

For full product scope see [`docs/mvp/definition.md`](./docs/mvp/definition.md). For current build status see [`docs/STATUS.md`](./docs/STATUS.md).

---

## Monorepo structure

```
apps/
  api/   — Fastify 5 REST API, Drizzle ORM, Supabase Auth JWT validation. Port 4000.
  web/   — Next.js 15 (App Router) + React 19 + Tailwind 4. Port 3001.
  bot/   — Discord.js 14 slash-command bot (compendium lookup + character sheet + world data).

packages/
  domain/             — Pure business logic + Zod schemas. No IO. Single source of rule truth.
  compendium-import/  — 5etools → Postgres importer (races, classes, spells, items, monsters, …).

infra/
  supabase/           — Self-hosted Supabase stack via Docker Compose (Postgres, Auth, Studio).

data/
  5etools/            — Upstream rule data (treated as input, not truth — PHB 2014 wins).

scripts/              — Utility scripts (key generation, etc.).
```

---

## Quickstart

### Prerequisites

- Node >= 22, pnpm 10.7
- Docker (for the Supabase stack)

### First-time setup

```bash
# 1. Install dependencies
pnpm install

# 2. Bootstrap Supabase Docker Compose
pnpm supabase:bootstrap

# 3. Generate secrets (JWT, anon key, service role, etc.)
pnpm gen:keys
# Paste the printed values into:
#   infra/supabase/.env    (use infra/supabase/env.example as template — this file is
#                            created by `pnpm supabase:bootstrap` in step 2, it does not
#                            ship in the repo)
#   apps/api/.env          (use apps/api/env.example as template)
#
# apps/web also needs a .env — use apps/web/.env.example as template (not required to
# start the Supabase stack, but required before running `pnpm --filter @dungeon-hub/web dev`).

# 4. Start the Supabase stack
pnpm supabase:up
# Wait ~15–30 s on first boot

# 5. Run migrations and import compendium data
pnpm --filter @dungeon-hub/api db:migrate

# import:5etools requires the 5etools dataset at data/5etools/data/, which is NOT
# distributed with this repo (data/5etools/ is gitignored and there is no submodule).
# Populate it manually first, e.g. by copying the `data/` directory out of a checkout
# of https://github.com/5etools-mirror-3/5etools-src into data/5etools/data/.
# packages/compendium-import/src/reader.ts expects the standard 5etools layout:
#   data/5etools/data/races.json, items.json, items-base.json, feats.json,
#   backgrounds.json, actions.json, optionalfeatures.json, conditionsdiseases.json,
#   languages.json, class/class-*.json, spells/spells-*.json, bestiary/bestiary-*.json
# Without this data in place, the command below fails. See "Known setup gaps" below.
pnpm --filter @dungeon-hub/api import:5etools
pnpm --filter @dungeon-hub/api seed-modifier-definitions

# 6. Apply custom SQL (triggers, special indexes — idempotent)
for f in apps/api/drizzle/custom/0001-auth-mirror-trigger.sql \
         apps/api/drizzle/custom/0002-hexes-unique-nulls-not-distinct.sql \
         apps/api/drizzle/custom/0003-hexes-unique-world-nulls-not-distinct.sql; do
  sudo docker exec -i supabase-db psql -U postgres -d postgres < "$f"
done
```

### Daily stack startup

`pnpm dev` at the root only starts the API. A full local stack requires four processes:

```bash
# Terminal 1 — Supabase (if not already running)
pnpm supabase:up

# Terminal 2 — API
pnpm dev
# or: pnpm --filter @dungeon-hub/api dev

# Terminal 3 — Web
pnpm --filter @dungeon-hub/web dev

# Terminal 4 — Bot (optional, needs apps/bot/.env)
pnpm --filter @dungeon-hub/bot dev
```

### Service URLs

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:3001 | Next.js frontend |
| API | http://localhost:4000 | `GET /api/v1/health` to verify |
| Supabase Studio | http://localhost:3000 | DB dashboard |
| Supabase Kong | http://localhost:8000 | Auth gateway |
| Postgres (direct) | localhost:5433 | Drizzle connection target |

### Known setup gaps

- **5etools dataset is not distributed with this repo.** `data/5etools/` is gitignored and there is no git submodule wiring it up, so `pnpm --filter @dungeon-hub/api import:5etools` (step 5 above) fails on a fresh clone until you populate `data/5etools/data/` yourself. The upstream mirror at [`5etools-mirror-3/5etools-src`](https://github.com/5etools-mirror-3/5etools-src) ships its `data/` directory in exactly the layout `reader.ts` expects (`races.json`, `items.json`, `class/class-*.json`, `spells/`, `bestiary/`, …); copy that directory in. Automating this step is still open work.
- **`infra/supabase/env.example` only exists after bootstrap.** It is generated by `pnpm supabase:bootstrap`, not versioned in git; do not look for it before running that command.

---

## Testing & typechecking

```bash
# Run all tests (unit + integration + component)
pnpm test

# Per-package
pnpm --filter @dungeon-hub/domain test
pnpm --filter @dungeon-hub/api test
pnpm --filter @dungeon-hub/web test
pnpm --filter @dungeon-hub/bot test

# E2E (Playwright — full stack must be running)
pnpm --filter @dungeon-hub/web test:e2e

# Typecheck (use this instead of build for verification)
pnpm typecheck
```

---

## Where to read more

| Doc | What it covers |
|---|---|
| [`docs/mvp/definition.md`](./docs/mvp/definition.md) | MVP scope — the authoritative feature list and current status |
| [`docs/STATUS.md`](./docs/STATUS.md) | Build status snapshot |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Remaining work and priority order |
| [`CLAUDE.md`](./CLAUDE.md) | Project conventions for code, testing, architecture, and AI agents |
| [`docs/onboarding/`](./docs/onboarding/) | Operator checklist, DM onboarding, E2E setup |
| [`docs/onboarding/api-deploy.md`](./docs/onboarding/api-deploy.md) | Deploying the API — manual, and **not** covered by the Vercel deploy |
| [`docs/manuals/dsl.md`](./docs/manuals/dsl.md) | Compendium entity DSL reference |
