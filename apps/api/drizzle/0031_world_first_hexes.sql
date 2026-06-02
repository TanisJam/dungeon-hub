-- ---------------------------------------------------------------------------
-- world-first-model Slice 1: Re-parent hexes from campaign_id to world_id.
--
-- Lifecycle (ADR-2):
--   1. ADD world_id nullable
--   2. Backfill from campaigns.world_id (1:1 deterministic via 0015)
--   3. SET NOT NULL + add FK constraint to worlds(id) ON DELETE CASCADE
--   4. Add new index idx_hexes_world_parent, drop old idx_hexes_campaign_parent
--   5. DROP COLUMN campaign_id
--
-- Down-migration: re-add campaign_id, backfill from campaigns via world_id
-- (join hexes → worlds → campaigns WHERE campaigns.world_id = hexes.world_id),
-- drop world_id, restore old index.
--
-- Note: pois re-parents implicitly via hex cascade (no pois migration needed).
-- Note: custom/0003 handles the nullsNotDistinct unique index rewrite.
-- ---------------------------------------------------------------------------

--> statement-breakpoint
ALTER TABLE "hexes" ADD COLUMN "world_id" uuid;

--> statement-breakpoint
-- Backfill: resolve world_id from the campaign each hex was linked to.
-- This is 1:1 deterministic because campaigns.world_id is NOT NULL (since migration 0015).
UPDATE "hexes"
SET "world_id" = (
  SELECT c."world_id"
  FROM "campaigns" c
  WHERE c."id" = "hexes"."campaign_id"
);

--> statement-breakpoint
ALTER TABLE "hexes" ALTER COLUMN "world_id" SET NOT NULL;

--> statement-breakpoint
ALTER TABLE "hexes"
  ADD CONSTRAINT "hexes_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id")
  REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE
  ON UPDATE NO ACTION;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hexes_world_parent" ON "hexes" USING btree ("world_id", "parent_hex_id");

--> statement-breakpoint
DROP INDEX IF EXISTS "idx_hexes_campaign_parent";

--> statement-breakpoint
-- Drop the campaign_id FK constraint first, then the column.
ALTER TABLE "hexes" DROP CONSTRAINT IF EXISTS "hexes_campaign_id_campaigns_id_fk";

--> statement-breakpoint
ALTER TABLE "hexes" DROP COLUMN "campaign_id";