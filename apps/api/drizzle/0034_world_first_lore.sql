-- world-first-model Slice 3: re-parent world_events + journal_entries
-- from campaign_id → world_id (ON DELETE CASCADE on worlds).
-- source_session_id FK (sessions → set null) is RETAINED unchanged.
-- author_user_id FK on journal_entries is RETAINED unchanged.
-- Index swap: campaign→world (keeping gin tags indexes and source index).
--
-- ADR-2 lifecycle per table:
--   1. ADD world_id nullable
--   2. BACKFILL via campaigns.world_id
--   3. SET NOT NULL + FK
--   4. CREATE new index, DROP old campaign index
--   5. DROP campaign_id column

--> statement-breakpoint

-- ============================================================
-- TABLE: world_events
-- ============================================================

-- 1. Add world_id nullable
ALTER TABLE "world_events" ADD COLUMN "world_id" uuid;

--> statement-breakpoint

-- 2. Backfill from campaigns.world_id
UPDATE "world_events"
SET "world_id" = (
  SELECT "world_id"
  FROM "campaigns"
  WHERE "campaigns"."id" = "world_events"."campaign_id"
)
WHERE "campaign_id" IS NOT NULL;

--> statement-breakpoint

-- 3. SET NOT NULL + add FK to worlds (ON DELETE CASCADE)
ALTER TABLE "world_events" ALTER COLUMN "world_id" SET NOT NULL;
ALTER TABLE "world_events"
  ADD CONSTRAINT "world_events_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

-- 4. Create new index on (world_id, occurred_at), drop old campaign index
CREATE INDEX "idx_world_events_world_time" ON "world_events" ("world_id", "occurred_at");
DROP INDEX IF EXISTS "idx_world_events_campaign_time";

--> statement-breakpoint

-- 5. Drop campaign_id column (and its FK constraint)
ALTER TABLE "world_events" DROP CONSTRAINT IF EXISTS "world_events_campaign_id_campaigns_id_fk";
ALTER TABLE "world_events" DROP COLUMN "campaign_id";

--> statement-breakpoint

-- ============================================================
-- TABLE: journal_entries
-- ============================================================

-- 1. Add world_id nullable
ALTER TABLE "journal_entries" ADD COLUMN "world_id" uuid;

--> statement-breakpoint

-- 2. Backfill from campaigns.world_id
UPDATE "journal_entries"
SET "world_id" = (
  SELECT "world_id"
  FROM "campaigns"
  WHERE "campaigns"."id" = "journal_entries"."campaign_id"
)
WHERE "campaign_id" IS NOT NULL;

--> statement-breakpoint

-- 3. SET NOT NULL + add FK to worlds (ON DELETE CASCADE)
ALTER TABLE "journal_entries" ALTER COLUMN "world_id" SET NOT NULL;
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

-- 4. Create new index on (world_id, updated_at), drop old campaign index
CREATE INDEX "idx_journal_world_updated" ON "journal_entries" ("world_id", "updated_at");
DROP INDEX IF EXISTS "idx_journal_campaign_updated";

--> statement-breakpoint

-- 5. Drop campaign_id column (and its FK constraint)
ALTER TABLE "journal_entries" DROP CONSTRAINT IF EXISTS "journal_entries_campaign_id_campaigns_id_fk";
ALTER TABLE "journal_entries" DROP COLUMN "campaign_id";
