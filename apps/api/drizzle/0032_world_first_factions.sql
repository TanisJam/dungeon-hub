-- ---------------------------------------------------------------------------
-- world-first-model Slice 2a: Re-parent factions from campaign_id to world_id.
-- Also drops the factions.reputation column (party-level reputation removed;
-- per-character×faction reputation lands in Slice 2b as character_faction_reputation).
--
-- Lifecycle (ADR-2):
--   1. ADD world_id nullable
--   2. Backfill from campaigns.world_id (1:1 deterministic via 0015)
--   3. SET NOT NULL + add FK constraint to worlds(id) ON DELETE CASCADE
--   4. Add new index idx_factions_world, drop old idx_factions_campaign
--   5. DROP COLUMN campaign_id
--   6. DROP COLUMN reputation
--
-- Down-migration: re-add campaign_id + reputation, backfill campaign_id from
-- worlds (join factions → worlds → campaigns WHERE campaigns.world_id=factions.world_id),
-- drop world_id, restore old index.
-- ---------------------------------------------------------------------------

--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "world_id" uuid;

--> statement-breakpoint
-- Backfill: resolve world_id from the campaign each faction was linked to.
-- This is 1:1 deterministic because campaigns.world_id is NOT NULL (since migration 0015).
UPDATE "factions"
SET "world_id" = (
  SELECT c."world_id"
  FROM "campaigns" c
  WHERE c."id" = "factions"."campaign_id"
);

--> statement-breakpoint
ALTER TABLE "factions" ALTER COLUMN "world_id" SET NOT NULL;

--> statement-breakpoint
ALTER TABLE "factions"
  ADD CONSTRAINT "factions_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id")
  REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE
  ON UPDATE NO ACTION;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_factions_world" ON "factions" USING btree ("world_id");

--> statement-breakpoint
DROP INDEX IF EXISTS "idx_factions_campaign";

--> statement-breakpoint
-- Drop the campaign_id FK constraint first, then the column.
ALTER TABLE "factions" DROP CONSTRAINT IF EXISTS "factions_campaign_id_campaigns_id_fk";

--> statement-breakpoint
ALTER TABLE "factions" DROP COLUMN "campaign_id";

--> statement-breakpoint
-- Drop party-level reputation column. Per-character×faction reputation
-- will be added in Slice 2b as character_faction_reputation table.
ALTER TABLE "factions" DROP COLUMN "reputation";
