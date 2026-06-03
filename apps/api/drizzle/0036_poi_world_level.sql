-- poi-world-level Slice 1 (PR#1): re-anchor pois to world_id directly.
-- hex_id retained NULLABLE (NPC last-known-location model); cascade → SET NULL.
--
-- Lifecycle (interrupt-safe — additive first, destructive last):
--   1. ADD pois.world_id nullable
--   2. Backfill world_id from parent hex (hexes.world_id via hex_id)
--      All existing pois have hex_id; all hexes have world_id → backfill total.
--   3. ALTER world_id SET NOT NULL + FK → worlds(id) ON DELETE CASCADE
--   4. CREATE INDEX idx_pois_world
--   5. hex_id DROP NOT NULL (free-floating POIs now allowed)
--   6. Swap hex_id FK: CASCADE → SET NULL (DM work survives hex deletion)
--
-- Down (conceptual):
--   Re-add hex_id NOT NULL (all rows still have hex_id pre-PR2), restore CASCADE,
--   drop world_id + idx.

--> statement-breakpoint
ALTER TABLE "pois" ADD COLUMN "world_id" uuid;

--> statement-breakpoint
UPDATE "pois"
SET "world_id" = (
  SELECT h."world_id" FROM "hexes" h WHERE h."id" = "pois"."hex_id"
);

--> statement-breakpoint
ALTER TABLE "pois" ALTER COLUMN "world_id" SET NOT NULL;

--> statement-breakpoint
ALTER TABLE "pois"
  ADD CONSTRAINT "pois_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pois_world" ON "pois" USING btree ("world_id");

--> statement-breakpoint
ALTER TABLE "pois" ALTER COLUMN "hex_id" DROP NOT NULL;

--> statement-breakpoint
ALTER TABLE "pois" DROP CONSTRAINT IF EXISTS "pois_hex_id_hexes_id_fk";

--> statement-breakpoint
ALTER TABLE "pois"
  ADD CONSTRAINT "pois_hex_id_hexes_id_fk"
  FOREIGN KEY ("hex_id") REFERENCES "public"."hexes"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
