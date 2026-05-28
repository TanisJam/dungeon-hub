# DM Onboarding — how to start a West Marches campaign

> **Status**: MVP-stage doc. Some steps are still manual (SQL inserts) because the invitations UI is post-MVP. Each manual step is flagged with **MANUAL** and the future SDD that will replace it.

This walkthrough covers everything from "stack is running" to "first player has a character on the sheet". Aimed at the DM. Total time: ~15 minutes for the DM + ~5 minutes per player.

## Prerequisites

1. **Stack running locally**:
   - Supabase docker compose up: `pnpm supabase:up`
   - API: `pnpm --filter @dungeon-hub/api dev` (port 4000)
   - Web: `pnpm --filter @dungeon-hub/web dev` (port 3001)
   - Bot: `pnpm --filter @dungeon-hub/bot dev` (Discord guild configured per `apps/bot/README.md`)

2. **5etools data imported**:
   ```bash
   pnpm --filter @dungeon-hub/api import:5etools
   ```
   See [`packages/compendium-import/README.md`](../../packages/compendium-import/README.md).

3. **DM has signed in to the web app** at least once (`http://localhost:3001`). Supabase auth bootstraps the user via the auth-mirror trigger.

---

## Step 1 — Get your JWT

You'll need your Supabase JWT to call the API directly until the campaign-creation UI lands.

1. Open `http://localhost:3001/dev/token` while logged in.
2. Copy the token. Set it in your shell:
   ```bash
   export JWT="eyJhbGc..."
   ```

> **MANUAL** — the `/dev/token` page only exists in dev. Future SDD `web-campaign-creation-ui` will surface a "Crear campaña" button on the dashboard so this manual step goes away.

## Step 2 — Create the world + campaign

A single API call creates both atomically. You (the caller) become the GM of the world and a `gm` member of the campaign.

```bash
curl -X POST http://localhost:4000/api/v1/campaigns \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "name": "West Marches" }'
```

Response:
```json
{
  "id": "<campaign-uuid>",
  "name": "West Marches",
  "gmUserId": "<your-user-uuid>",
  "worldId": "<world-uuid>",
  "rulesProfile": { "...": "..." },
  "createdAt": "2026-05-27T..."
}
```

**Save both `id` (campaign) and `worldId`** — you'll use them in step 5.

### Customize the rules profile (optional)

The default rules profile enables PHB 2014 + variant rules turned OFF. To opt into feats:
```json
{ "name": "West Marches", "rulesProfile": { "variantRules": { "feats": true } } }
```
See `apps/api/src/use-cases/world/default-rules-profile.ts` for the full default + structure.

## Step 3 — Verify the campaign

Refresh `http://localhost:3001/dashboard`. You should see "West Marches" with a **DM** pill.

## Step 4 — Players link Discord → web

Each player runs this flow once:

1. **Player joins your Discord guild** (the guild ID configured in `apps/bot/.env`).
2. In Discord, the player runs `/link`. The bot replies with an ephemeral URL like:
   ```
   http://localhost:3001/link/<token>
   ```
3. Player opens the URL. The web app shows the Discord username it's about to link.
4. Player clicks "Confirmar" → their Supabase account is now linked to the Discord ID.
5. From that point on, the bot impersonates them when they run `/mi-hoja` etc.

> **MANUAL → automated**: the bot's `/link` command already exists; players just run it on their own. No DM intervention needed for this step.

After linking, the player can sign in to the web app (Supabase auth) and reach `/dashboard`.

## Step 5 — Add players to the world + campaign

> **MANUAL** — invitations UI is post-MVP. Future SDD `dm-player-invitations` will replace this step with a "Invitar jugador" button + invite-link flow.

For each player, you need their `user_id`. Get it from the bot's `/whoami` command (the player runs it; the bot replies with their user_id), or query Supabase Studio:

```sql
SELECT id, username, discord_username FROM public.users;
```

Then add them to the world and campaign:

```sql
INSERT INTO world_members (world_id, user_id, role)
VALUES ('<world-id>', '<player-user-id>', 'player');

INSERT INTO campaign_members (campaign_id, user_id, role)
VALUES ('<campaign-id>', '<player-user-id>', 'player');
```

Run via Supabase Studio's SQL editor (`http://localhost:3000` → SQL editor) or:
```bash
sudo docker exec -i supabase-db psql -U postgres -d postgres << 'EOF'
INSERT INTO world_members (world_id, user_id, role) VALUES ('...', '...', 'player');
INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ('...', '...', 'player');
EOF
```

## Step 6 — Verify the player joined

Have the player refresh `http://localhost:3001/dashboard`. They should see "West Marches" with a **Jugador** pill.

## Step 7 — Player creates a character

Player clicks **Crear personaje** on the dashboard → wizard at `/characters/new` → picks the world → walks through stats → race → class → background → spells (if applicable) → submits.

Character starts in `draft` status. Once they finish the wizard, it moves to `pending_approval`. You as DM approve in your **DM Panel** (`/worlds/[worldId]`).

## Step 8 — DM approves

1. Open `/worlds/<your-world-id>` (find the link from the dashboard campaign card).
2. **Pendientes** tab shows characters awaiting approval.
3. Click **Aprobar** on the character → it moves to `active`.
4. Player can now level up, use resources, accept session events, etc.

## Step 9 — Run your first session

1. Open the **Sesiones** tab on the world page.
2. Click **Crear sesión** → describe it → save.
3. Players click **Unirme** on the session card on their dashboard (with their active character selected).
4. Run the table. Grant XP / gold / items via the DM panel during/after the session.
5. Close the session → grants are persisted, hit dice / spell slots reset per rest rules.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `409 USER_NOT_PROVISIONED` on POST /campaigns | auth-mirror trigger missing | Apply `apps/api/drizzle/custom/0001-auth-mirror-trigger.sql` (see root `README.md` Quickstart step 6). |
| Player sees no campaign on dashboard | Step 5 not run | Insert the `world_members` + `campaign_members` rows. |
| `/link` returns "no autorizado" | Bot doesn't have `can_impersonate=true` on its user row | `UPDATE users SET can_impersonate=true WHERE username='<bot-user>';` |
| 5etools data missing | Step 2 of root Quickstart skipped | `pnpm --filter @dungeon-hub/api import:5etools` |

---

## What's manual today vs. what's automated

| Step | Status | Future SDD that automates it |
|---|---|---|
| Create world + campaign | curl + JWT | `web-campaign-creation-ui` |
| Player /link via Discord | ✅ automated (bot ships today) | — |
| Add player to world + campaign | SQL inserts | `dm-player-invitations` |
| Player creates character | ✅ automated (wizard) | — |
| DM approves character | ✅ automated (DM panel) | — |
| DM grants XP/gold/item | ✅ automated (DM panel) | — |
| Session lifecycle | ✅ automated (web + bot) | — |
| Player views sheet | ✅ automated (web + `/mi-hoja` bot) | — |

The two manual steps (campaign creation + player addition) are scoped for post-MVP polish. Until then, this doc is the canonical path.

---

## Related docs

- Root [`README.md`](../../README.md) — stack quickstart (Supabase + API + migrations).
- [`apps/bot/README.md`](../../apps/bot/README.md) — bot setup + commands.
- [`apps/web/e2e/README.md`](../../apps/web/e2e/README.md) — E2E test prereqs.
- [`packages/compendium-import/README.md`](../../packages/compendium-import/README.md) — importing 5etools data + authoring homebrew packs.
- [`docs/manuals/dsl.md`](../manuals/dsl.md) — manual JSON schema (homebrew authors).
- [`docs/manuals/conflict-resolution.md`](../manuals/conflict-resolution.md) — cross-manual source resolution per world.
- [`docs/mvp/definition.md`](../mvp/definition.md) — MVP scope.
