-- ---------------------------------------------------------------------------
-- world-first-model Slice 2b: Re-parent npcs from campaign_id to world_id.
-- Also drops npcs.faction_id (direct FK → faction; replaced by npc_factions N:M join).
-- Adds npc_factions N:M join table and character_faction_reputation table.
--
-- Lifecycle (ADR-2):
--   1. ADD npcs.world_id nullable
--   2. Backfill npcs.world_id from campaigns.world_id (1:1 via 0015)
--   3. SET NOT NULL + add FK constraint to worlds(id) ON DELETE CASCADE
--   4. Add index idx_npcs_world; drop idx_npcs_campaign
--   5. Drop npcs.faction_id FK constraint, then column
--   6. DROP COLUMN npcs.campaign_id
--   7. CREATE TABLE npc_factions (npc_id, faction_id, PK composite)
--   8. CREATE TABLE character_faction_reputation (character_id, faction_id, value, PK composite)
--
-- Down-migration (conceptual):
--   DROP character_faction_reputation, DROP npc_factions,
--   re-add campaign_id to npcs (backfill from worlds→campaigns),
--   re-add faction_id nullable to npcs, drop world_id, restore old index.
-- ---------------------------------------------------------------------------

--> statement-breakpoint
ALTER TABLE "npcs" ADD COLUMN "world_id" uuid;

--> statement-breakpoint
-- Backfill: resolve world_id from the campaign each NPC was linked to.
-- 1:1 deterministic because campaigns.world_id is NOT NULL (since migration 0015).
UPDATE "npcs"
SET "world_id" = (
  SELECT c."world_id"
  FROM "campaigns" c
  WHERE c."id" = "npcs"."campaign_id"
);

--> statement-breakpoint
ALTER TABLE "npcs" ALTER COLUMN "world_id" SET NOT NULL;

--> statement-breakpoint
ALTER TABLE "npcs"
  ADD CONSTRAINT "npcs_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id")
  REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE
  ON UPDATE NO ACTION;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_npcs_world" ON "npcs" USING btree ("world_id");

--> statement-breakpoint
DROP INDEX IF EXISTS "idx_npcs_campaign";

--> statement-breakpoint
-- Drop faction_id FK constraint first, then the column.
-- The direct npcs.faction_id FK is replaced by the npc_factions join table.
ALTER TABLE "npcs" DROP CONSTRAINT IF EXISTS "npcs_faction_id_factions_id_fk";

--> statement-breakpoint
ALTER TABLE "npcs" DROP COLUMN IF EXISTS "faction_id";

--> statement-breakpoint
-- Drop the campaign_id FK constraint first, then the column.
ALTER TABLE "npcs" DROP CONSTRAINT IF EXISTS "npcs_campaign_id_campaigns_id_fk";

--> statement-breakpoint
ALTER TABLE "npcs" DROP COLUMN "campaign_id";

--> statement-breakpoint
-- N:M join table: NPC ↔ Faction membership.
-- An NPC may belong to 0..N factions; a faction may have 0..N NPCs.
-- Same-world invariant enforced at use-case layer (not DB constraint).
-- CASCADE on both FKs: removing npc or faction removes membership rows.
CREATE TABLE IF NOT EXISTS "npc_factions" (
  "npc_id" uuid NOT NULL REFERENCES "public"."npcs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "faction_id" uuid NOT NULL REFERENCES "public"."factions"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "npc_factions_npc_id_faction_id_pk" PRIMARY KEY ("npc_id", "faction_id")
);

--> statement-breakpoint
-- Per-(character×faction) reputation. Signed integer, no domain cap.
-- Same-world invariant enforced at use-case layer.
-- CASCADE on both FKs: removing character or faction removes reputation rows.
CREATE TABLE IF NOT EXISTS "character_faction_reputation" (
  "character_id" uuid NOT NULL REFERENCES "public"."characters"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "faction_id" uuid NOT NULL REFERENCES "public"."factions"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "value" integer NOT NULL DEFAULT 0,
  CONSTRAINT "character_faction_reputation_character_id_faction_id_pk" PRIMARY KEY ("character_id", "faction_id")
);
