-- Migration: 0015_worlds_foundation
--
-- Introduces the `worlds` top-level ownership entity above `campaigns`.
-- Authority axis moves from campaign.gm_user_id equality to world_members.role='gm'.
-- rules_profile moves from campaigns → worlds (1:1 per Option C).
-- characters.campaign_id is DROPPED; characters.world_id added.
--
-- ALL DDL + DML is in a single transaction (Drizzle runner wraps each file in BEGIN/COMMIT).
--
-- DOWN (manual): write 0016_revert_worlds_foundation.sql — dev-only, no prod data today.
--
-- Safety: campaigns.gm_user_id is NOT NULL per migration 0000. If a NULL is found,
-- the INSERT into worlds will raise a NOT NULL violation — fix data before re-running.

-- ---------------------------------------------------------------------------
-- Step 1: Create worlds table
-- rules_profile starts NULLABLE so the backfill INSERT can populate it,
-- then we set NOT NULL after (step 7).
-- ---------------------------------------------------------------------------
CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"rules_profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_worlds_slug" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "idx_worlds_owner" ON "worlds" USING btree ("owner_user_id");

-- ---------------------------------------------------------------------------
-- Step 2: Create world_members table
-- ---------------------------------------------------------------------------
CREATE TABLE "world_members" (
	"world_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_members_world_id_user_id_pk" PRIMARY KEY("world_id","user_id"),
	CONSTRAINT "world_members_role_check" CHECK (role IN ('gm', 'player'))
);
--> statement-breakpoint
CREATE INDEX "idx_world_members_user" ON "world_members" USING btree ("user_id");

-- ---------------------------------------------------------------------------
-- Step 3: Backfill worlds — one per existing campaign (Option C)
--
-- world.name     = "<campaign.name> (World)"
-- world.slug     = lower(kebab(name)) + '-' + first-8-chars-of-campaign-uuid
--                  guarantees uniqueness even if two campaigns share a name.
-- world.owner    = campaign.gm_user_id
-- world.rules_profile = COALESCE(campaign.rules_profile, '{}'::jsonb)
--
-- The slug expression:
--   1. Appends ' (World)' to the name, then lowercases.
--   2. Replaces any run of non-alphanumeric chars with '-'.
--   3. Strips leading/trailing hyphens.
--   4. Appends '-' + first 8 hex chars of campaign UUID for uniqueness.
-- ---------------------------------------------------------------------------
INSERT INTO worlds (id, name, slug, owner_user_id, rules_profile, created_at, updated_at)
SELECT
  gen_random_uuid(),
  campaigns.name || ' (World)',
  trim(both '-' from regexp_replace(
    lower(campaigns.name || ' world'),
    '[^a-z0-9]+',
    '-',
    'g'
  )) || '-' || substring(campaigns.id::text, 1, 8),
  campaigns.gm_user_id,
  COALESCE(campaigns.rules_profile, '{}'::jsonb),
  now(),
  now()
FROM campaigns;

-- ---------------------------------------------------------------------------
-- Step 4: Add campaigns.world_id (nullable first, backfill, then NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE "campaigns" ADD COLUMN "world_id" uuid;
--> statement-breakpoint

-- Backfill campaigns.world_id via a CTE join on owner + name derivation.
-- The slug-based join is fragile if names clash; use owner+name pairing instead.
WITH campaign_world_map AS (
  SELECT
    c.id AS campaign_id,
    w.id AS world_id
  FROM campaigns c
  JOIN worlds w
    ON w.name = c.name || ' (World)'
    AND w.owner_user_id = c.gm_user_id
)
UPDATE campaigns
SET world_id = campaign_world_map.world_id
FROM campaign_world_map
WHERE campaigns.id = campaign_world_map.campaign_id;
--> statement-breakpoint

ALTER TABLE "campaigns" ALTER COLUMN "world_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;

-- ---------------------------------------------------------------------------
-- Step 5: Add characters.world_id (nullable first, backfill via campaign, then NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE "characters" ADD COLUMN "world_id" uuid;
--> statement-breakpoint

-- Backfill characters.world_id via characters → campaigns → worlds.
UPDATE characters
SET world_id = c.world_id
FROM campaigns c
WHERE c.id = characters.campaign_id;
--> statement-breakpoint

ALTER TABLE "characters" ALTER COLUMN "world_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;

-- ---------------------------------------------------------------------------
-- Step 6: Insert worldMembers — one gm row per world (from owner_user_id)
-- ---------------------------------------------------------------------------
INSERT INTO world_members (world_id, user_id, role, invited_at)
SELECT id, owner_user_id, 'gm', now()
FROM worlds
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Step 7: Finalize worlds.rules_profile — set NOT NULL, add FK to users
-- ---------------------------------------------------------------------------
ALTER TABLE "worlds" ALTER COLUMN "rules_profile" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "world_members" ADD CONSTRAINT "world_members_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "world_members" ADD CONSTRAINT "world_members_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- ---------------------------------------------------------------------------
-- Step 8: Drop campaigns.rules_profile (now on worlds, 1:1)
-- ---------------------------------------------------------------------------
ALTER TABLE "campaigns" DROP COLUMN "rules_profile";

-- ---------------------------------------------------------------------------
-- Step 9: Drop characters.campaign_id (locked decision #774) and its index
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "idx_characters_campaign";
--> statement-breakpoint
ALTER TABLE "characters" DROP CONSTRAINT IF EXISTS "characters_campaign_id_campaigns_id_fk";
--> statement-breakpoint
ALTER TABLE "characters" DROP COLUMN "campaign_id";
--> statement-breakpoint
CREATE INDEX "idx_characters_world" ON "characters" USING btree ("world_id");
