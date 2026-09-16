# Deploying the API

The web app deploys itself: Vercel builds and publishes `apps/web` on every push to
`main`. **The API does not.** It runs as a Docker container on the home-lab VM and is
deployed by hand, so merging to `main` ships the frontend and nothing else.

This document exists because that was previously undocumented, and because the
`deploy/` directory it depends on had been deleted from the repository — it survived
only inside the VM. Losing that machine would have meant losing the ability to rebuild
the backend at all.

---

## What runs where

| Piece | Where | Deployed by |
|---|---|---|
| `apps/web` | Vercel | Automatic, on push to `main` |
| `apps/api` | Home-lab VM, container `dungeon-hub-api` | **Manual — this document** |
| Supabase (Postgres, Auth, Storage, Kong) | Same VM, `dungeon-hub-supabase_*` | Docker Compose, long-lived |

The production frontend bakes `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SUPABASE_URL`
at build time and points them at the VM, so the deployment is hybrid: Vercel serves
the frontend, and every request behind it lands on the home lab. Taking the VM down
takes production down, whatever Vercel reports.

## Layout on the VM

```
/opt/dungeon-hub-app-deploy/docker-compose.yml   # the compose file that defines the api service
/opt/dungeon-hub-app-deploy/.env                 # POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
/opt/dungeon-hub-app/                            # source the image is built from — a flat copy, NOT a git checkout
```

The container runs `tsx src/index.ts` directly: there is no compile step, and
`packages/domain` is consumed as TypeScript source. The image is therefore mostly
source plus `node_modules`, which is why it is large (~3.3 GB) and why a deploy is
essentially "copy new source, rebuild, restart".

> **The `.env` has every key duplicated with different values.** Compose applies the
> last occurrence, so the *second* value is the live one. Any script that reads it with
> `grep -m1` picks up a stale key and fails with `signature verification failed`. Use
> `grep '^KEY=' .env | tail -1`.

## Deploying

Everything below happens on the VM. Nothing here touches the running container until
the swap step, so a failed build costs time and nothing else.

**1. Keep a rollback.** Before anything, tag whatever is currently live:

```bash
docker tag dungeon-hub-app:latest dungeon-hub-app:rollback-$(date +%Y%m%d)
```

**2. Ship the source.** `git archive` sends exactly the committed tree — no local
build output, no `node_modules`, no stray files:

```bash
# from a clean checkout, on your machine
git archive --format=tar HEAD | \
  ssh root@<vm> 'rm -rf /opt/dungeon-hub-app-next && mkdir -p /opt/dungeon-hub-app-next && tar x -C /opt/dungeon-hub-app-next'
```

**3. Build a candidate.** Never build straight over `:latest` — a broken build would
leave you with no known-good image to fall back to. The `NEXT_PUBLIC_*` build args are
mandatory: Next.js inlines them, and the build fails without them.

```bash
cd /opt/dungeon-hub-app-next
docker build -f deploy/Dockerfile -t dungeon-hub-app:candidate \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://dungeon-hub-supabase.mnr.ar \
  --build-arg NEXT_PUBLIC_API_URL=https://dungeon-hub-api.mnr.ar \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$(grep '^ANON_KEY=' /opt/dungeon-hub-app-deploy/.env | tail -1 | cut -d= -f2-)" \
  .
```

**4. Verify the candidate before swapping.** Run it alongside the live container, on
the Supabase network but *without* Traefik labels, so it reaches the database while
staying unreachable from the internet:

```bash
docker run -d --name dh-api-candidate --network dungeon-hub-supabase_default \
  -w /app/apps/api \
  -e NODE_ENV=production -e PORT=4000 -e HOST=0.0.0.0 \
  -e DATABASE_URL="postgres://postgres:$(grep '^POSTGRES_PASSWORD=' /opt/dungeon-hub-app-deploy/.env | tail -1 | cut -d= -f2-)@supabase-db:5432/postgres" \
  -e SUPABASE_URL="http://supabase-kong:8000" \
  -e SUPABASE_JWT_SECRET="$(grep '^JWT_SECRET=' /opt/dungeon-hub-app-deploy/.env | tail -1 | cut -d= -f2-)" \
  -e SUPABASE_ANON_KEY="$(grep '^ANON_KEY=' /opt/dungeon-hub-app-deploy/.env | tail -1 | cut -d= -f2-)" \
  -e SUPABASE_SERVICE_ROLE_KEY="$(grep '^SERVICE_ROLE_KEY=' /opt/dungeon-hub-app-deploy/.env | tail -1 | cut -d= -f2-)" \
  -e WEB_APP_URL="https://dungeon-hub.mnr.ar" \
  dungeon-hub-app:candidate ../../node_modules/.bin/tsx src/index.ts
```

The image ships no `curl`, so probe it through Node:

```bash
docker exec dh-api-candidate node -e \
  'fetch("http://localhost:4000/api/v1/health").then(r=>r.text()).then(console.log)'
```

Expect `{"status":"ok","db":"up",...}`. A route added in this deploy should answer
`401` unauthenticated, while the same path against the live `dungeon-hub-api` still
answers `404` — that contrast is the clearest proof the new code is really in the
image.

**That proof does not generalise.** It only works when the release adds a brand-new
route. A release that changes an existing route — a new query param, a new response
field, a bugfix inside a handler — answers `401` on both the candidate and the live
container, because auth runs before validation: the contrast disappears even though
the code genuinely differs. Reaching for it anyway just tells you the release didn't
add a route, not that the new code is present.

The deploy-agnostic technique: pick a file the release actually adds or changes, and
check for its literal presence inside the container's filesystem — the image ships
mostly TypeScript source (see "Layout on the VM" above), so this works whether or not
the change touches a route at all:

```bash
docker exec dh-api-candidate node -e \
  'console.log(require("fs").existsSync("/app/apps/api/src/use-cases/world/feed-cursor.ts"))'
```

Run the same check against the live container **before** the swap as your baseline —
it should answer `false` (absent) if the file is genuinely new — then re-run it against
the swapped container afterward and expect `true` (present). This is what verified the
2026-09-16 keyset-pagination deploy, which added a new query param (`?cursor=`) to an
existing route (`GET /cronica-feed`) rather than a new route, so the `401`-vs-`404`
check would have shown nothing.

Remove the container when you are done: `docker rm -f dh-api-candidate`.

**5. Swap.** Only after the candidate is verified:

```bash
docker tag dungeon-hub-app:candidate dungeon-hub-app:latest
cd /opt/dungeon-hub-app-deploy && docker compose up -d --force-recreate api
```

**6. Confirm, from outside:**

```bash
curl -s https://dungeon-hub-api.mnr.ar/api/v1/health
```

## Rolling back

One command, and the previous image is live again:

```bash
docker tag dungeon-hub-app:rollback-<date> dungeon-hub-app:latest
cd /opt/dungeon-hub-app-deploy && docker compose up -d --force-recreate api
```

## Migrations

Schema changes are **not** part of the image and are not applied by deploying it. If
the release adds a migration, apply it with the Drizzle command — never by piping SQL
into `psql`, which desyncs `drizzle.__drizzle_migrations` and makes every later
`db:migrate` re-run and fail. See `CLAUDE.md` §11.

```bash
pnpm --filter @dungeon-hub/api db:migrate
```

Check what production already has before assuming a migration is pending:

```sql
select count(*) from drizzle.__drizzle_migrations;
```

## Known rough edges

- **The Dockerfile still runs `pnpm --filter @dungeon-hub/web build`.** The web app
  moved to Vercel, so that work is wasted and it is the only reason the `NEXT_PUBLIC_*`
  build args are required. Left as-is deliberately: the currently verified image was
  built by this exact file, and changing it is a separate decision from restoring it.
- **`/opt/dungeon-hub-app` is a flat copy, not a checkout**, so there is no reliable
  way to ask the VM which commit is deployed. File mtimes are the only clue. Comparing
  a route that exists in `main` against the live API (`401` vs `404`) is a better test.
- **The duplicated keys in `.env`** described above.
