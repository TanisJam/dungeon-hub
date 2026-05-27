# Operator Checklist — MVP §6.G (Operational)

> **Status**: MANUAL — you (the operator) execute each step and tick the box. None of this is automated. Time budget: ~30-45 min if everything is wired right, longer the first time.

Three gates: **G1** stack end-to-end, **G2** bot env vars for prod, **G3** backup/restore.

---

## G1 — `pnpm dev` arrancable end-to-end (api + web + bot + supabase docker)

`pnpm dev` at the root only starts the api. For a full local stack you run 4 processes. This checklist walks each one and proves connectivity.

### G1.1 — Supabase docker stack

```bash
pnpm supabase:up
# Wait ~15-30s on first boot for migrations + JWT cert gen
```

- [ ] Run `docker ps` — expect at least these containers up: `supabase-db`, `supabase-kong`, `supabase-auth`, `supabase-rest`, `supabase-storage`, `supabase-studio`.
- [ ] Open `http://localhost:3000` (Supabase Studio) — login screen renders.
- [ ] `curl http://localhost:8000/auth/v1/health` returns `{ "status": "ok", ... }`.
- [ ] `sudo docker exec supabase-db pg_isready -U postgres` prints `accepting connections`.

**If any of the above fails**: `pnpm supabase:logs` and look for the first ERROR. Common causes: stale volumes from a prior session (`pnpm supabase:down -v` to reset), missing `.env` in `infra/supabase/` (re-run `pnpm gen:keys` and paste into the env file).

### G1.2 — Migrations + auth-mirror trigger

```bash
pnpm --filter @dungeon-hub/api db:migrate
sudo docker exec -i supabase-db psql -U postgres -d postgres \
  < apps/api/drizzle/custom/0001-auth-mirror-trigger.sql
```

- [ ] `db:migrate` completes with `No migrations pending` (or applies pending ones cleanly).
- [ ] The custom SQL applies without errors (idempotent: re-running prints `function already exists` and exits 0).
- [ ] In Supabase Studio → SQL editor: `SELECT COUNT(*) FROM public.users;` returns 0 (or your existing count).

### G1.3 — Compendium import

```bash
pnpm --filter @dungeon-hub/api import:5etools
```

- [ ] Script ends with the summary block (races, classes, ..., warnings).
- [ ] `SELECT COUNT(*) FROM compendium_spells WHERE source = 'PHB';` returns ≥ 300.
- [ ] `SELECT COUNT(*) FROM compendium_races WHERE source = 'PHB';` returns ≥ 9.
- [ ] Warnings printed by the importer are all known/expected (see `CLAUDE.md §10` and `packages/compendium-import/README.md`).

### G1.4 — API

In a fresh shell:
```bash
pnpm dev
# or: pnpm --filter @dungeon-hub/api dev
```

- [ ] Server starts and logs `Listening on http://0.0.0.0:4000`.
- [ ] `curl http://localhost:4000/api/v1/health` returns `{ "status": "ok", "db": "up", ... }`.
- [ ] No env-validation errors at startup (would be a Zod-flatten log + exit 1).

### G1.5 — Web

In another fresh shell:
```bash
pnpm --filter @dungeon-hub/web dev
```

- [ ] Server starts on port 3001.
- [ ] Open `http://localhost:3001` — landing page renders, "Iniciar sesión" button visible.
- [ ] Sign in with a Supabase account (create one via Studio if needed).
- [ ] `/dashboard` loads — should be empty for a fresh DM (no campaigns yet).
- [ ] DevTools network tab: requests to `/api/v1/*` succeed with 200 (or expected 401/404).

### G1.6 — Bot

In another fresh shell:
```bash
pnpm --filter @dungeon-hub/bot dev
```

- [ ] Console logs `Logged in as <bot-username>#<discriminator>`.
- [ ] Slash commands appear in Discord guild (`/mi-hoja`, `/link`, `/unlink`, etc.).
- [ ] Bot user has `can_impersonate=true` in `public.users` (`UPDATE users SET can_impersonate=true WHERE username='<bot>';` if not).

### G1.7 — Inter-service connectivity smoke

End-to-end smoke (`http://localhost:3001` + Discord guild + bot):

- [ ] As DM: POST a campaign via `curl` (see `docs/onboarding/dm-onboarding.md` step 2). Refresh `/dashboard` → campaign appears.
- [ ] As player: run `/link` in Discord → URL returned → opens `/link/<token>` → confirm → bot user record now has `discord_id` populated.
- [ ] As player: run `/mi-hoja` in Discord (after creating a character + DM approving) → bot replies with the sheet embed.

**G1 PASS** when every box above is ticked.

---

## G2 — Bot env vars documented for production

The bot needs the following env vars to run in prod. Source `apps/bot/src/env.ts` is authoritative; this checklist verifies each.

| Var | Required | Source | Verification |
|---|---|---|---|
| `DISCORD_TOKEN` | Yes | Discord Developer Portal → your bot app → "Bot" tab → Reset Token | Bot logs in as expected user |
| `DISCORD_CLIENT_ID` | Yes | Same app → "General Information" → Application ID | Used in OAuth invite link |
| `DISCORD_GUILD_ID` | Optional (dev fast register) | Right-click guild in Discord → Copy ID (dev mode on) | If omitted, slash commands register globally (slow propagation) |
| `API_BASE_URL` | Yes | Your prod API URL (e.g. `https://api.example.com`) | `curl $API_BASE_URL/api/v1/health` returns ok |
| `SUPABASE_URL` | Yes | Your prod Supabase Kong URL | Same Kong the API uses |
| `SUPABASE_ANON_KEY` | Yes | `pnpm gen:keys` output OR Supabase project settings | Matches the JWT-issuing instance |
| `BOT_EMAIL` | Yes | The Supabase account used as the bot's identity | Account exists in `auth.users` |
| `BOT_PASSWORD` | Yes | Matching password for `BOT_EMAIL` | Bot can sign in to Supabase |
| `CAMPAIGN_ID` | Yes | UUID of the campaign the bot serves | `SELECT id FROM campaigns WHERE name='...';` |
| `NODE_ENV` | Optional | `production` recommended in prod | Affects logging verbosity |

### G2 checklist

- [ ] All 9 required vars present in your prod env (host platform secrets, not committed `.env`).
- [ ] `BOT_EMAIL` user in `public.users` has `can_impersonate=true`.
- [ ] `CAMPAIGN_ID` exists in DB and the bot user is a `gm` or `player` member.
- [ ] Bot starts in prod and logs `Logged in as <expected-user>` — not `Invalid token`.
- [ ] `/link` round-trip works against prod API (replace the localhost URL the bot sends).

> **NEVER** commit `.env` files. The repo has `.env.example` templates only. Use your host platform's secrets store (Fly secrets, Railway env, Render env, etc.).

**G2 PASS** when every box above is ticked AND the bot survives a `/link` end-to-end in prod.

---

## G3 — `pg_dump` backup/restore

No UI for backups in MVP. The flow uses `pg_dump` via the supabase-db container so you don't need a local psql install. Verify the round-trip works BEFORE you need it.

### G3.1 — Take a backup

```bash
# Plain SQL dump (readable, larger)
sudo docker exec supabase-db pg_dump -U postgres -d postgres -Fp -f /tmp/dungeon-hub-$(date +%Y%m%d).sql
sudo docker cp supabase-db:/tmp/dungeon-hub-$(date +%Y%m%d).sql ./backups/

# OR custom format (compressed, restore-friendly)
sudo docker exec supabase-db pg_dump -U postgres -d postgres -Fc -f /tmp/dungeon-hub-$(date +%Y%m%d).dump
sudo docker cp supabase-db:/tmp/dungeon-hub-$(date +%Y%m%d).dump ./backups/
```

- [ ] `./backups/` exists (create it: `mkdir -p backups`).
- [ ] The dump file is non-empty and >100 KB after a populated import.
- [ ] `head -20` of the `.sql` shows `PostgreSQL database dump` header — confirms it's a real dump.

### G3.2 — Verify the dump can restore (DRY RUN against a scratch DB)

**Important**: do NOT restore into your live DB. Use a scratch DB or a fresh container.

```bash
# Create a scratch DB inside the existing container
sudo docker exec supabase-db psql -U postgres -c "CREATE DATABASE dungeon_hub_restore_test;"

# Restore the custom-format dump into it
sudo docker cp ./backups/dungeon-hub-YYYYMMDD.dump supabase-db:/tmp/restore.dump
sudo docker exec supabase-db pg_restore -U postgres -d dungeon_hub_restore_test --no-owner --no-acl /tmp/restore.dump

# Spot-check
sudo docker exec supabase-db psql -U postgres -d dungeon_hub_restore_test -c "SELECT COUNT(*) FROM compendium_spells;"
# Expect the same count as your live DB.

# Cleanup
sudo docker exec supabase-db psql -U postgres -c "DROP DATABASE dungeon_hub_restore_test;"
```

- [ ] Scratch DB created without errors.
- [ ] `pg_restore` completes (warnings about `extension` ownership are normal).
- [ ] Spot-check counts match the live DB (compendium tables are a good signal).
- [ ] Cleanup succeeds — scratch DB dropped.

### G3.3 — Actual restore procedure (when you NEED it)

This is the procedure in the disaster recovery scenario. **Don't run it as part of the checklist** — only when restoring after data loss.

```bash
# 1. Take the API down so no writes interfere
# (kill the api dev process or stop the prod deployment)

# 2. Drop and recreate the live DB
sudo docker exec supabase-db psql -U postgres -c "DROP DATABASE postgres;"
sudo docker exec supabase-db psql -U postgres -c "CREATE DATABASE postgres;"

# 3. Restore
sudo docker exec supabase-db pg_restore -U postgres -d postgres --no-owner --no-acl /tmp/restore.dump

# 4. Re-apply the auth-mirror trigger if needed
sudo docker exec -i supabase-db psql -U postgres -d postgres \
  < apps/api/drizzle/custom/0001-auth-mirror-trigger.sql

# 5. Bring the API back up
# (start the api dev process or redeploy)
```

- [ ] Document where backups live (recommended: `./backups/` in dev, S3 + lifecycle policy in prod).
- [ ] Cron/scheduled task documented for prod (out of scope for MVP — manual nightly backup is acceptable for launch).

**G3 PASS** when G3.1 + G3.2 succeed on your live data. G3.3 is the script you keep for the bad day.

---

## Wrap-up

When G1 + G2 + G3 are all PASS, §6.G is closed. Combined with:
- §6.F documentation (CLOSED per engram #944),
- §6.A automated criteria (CLOSED per #917),
- §6.5 R-07 (CLOSED per #942),

the only remaining gate is **§6.H operator E2E sign-off** — running the 4 Playwright specs from §6.11 against live Discord + Supabase. That's a separate manual session.

After H, you can tag the release. Suggested tag: `mvp-v1.0.0`.
