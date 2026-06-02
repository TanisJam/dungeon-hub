-- character-codex Slice 1: character_knowledge table
--
-- HOUSE RULE — anti-metagaming per-character knowledge layer.
-- No RAW basis (PHB p.177-179 has no per-character statblock gate).
--
-- Polymorphic via kind: bestiary | item | spell | npc | faction | location | lore.
-- Slice 1 proves architecture with 'bestiary'. Wave 2 adds other kinds.
--
-- UNIQUE(character_id, kind, ref_key, ref_source) → idempotent upsert (ON CONFLICT DO NOTHING).
-- INDEX(character_id, kind) → hot-path for player-bestiary query.
-- INDEX(world_id) → housekeeping queries by world.
--
-- character_codex SDD spec #1626, design #1627, tasks #1629.

--> statement-breakpoint

CREATE TABLE "character_knowledge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL,
  "world_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "ref_key" text NOT NULL,
  "ref_source" text NOT NULL,
  "source" text NOT NULL,
  "granted_by_user_id" uuid,
  "discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "character_knowledge_kind_check" CHECK (kind IN ('bestiary','item','spell','npc','faction','location','lore'))
);

--> statement-breakpoint

ALTER TABLE "character_knowledge"
  ADD CONSTRAINT "character_knowledge_character_id_characters_id_fk"
  FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

ALTER TABLE "character_knowledge"
  ADD CONSTRAINT "character_knowledge_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

ALTER TABLE "character_knowledge"
  ADD CONSTRAINT "character_knowledge_granted_by_user_id_users_id_fk"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

--> statement-breakpoint

-- UNIQUE constraint for idempotent upsert (ON CONFLICT DO NOTHING)
CREATE UNIQUE INDEX "uq_character_knowledge" ON "character_knowledge" ("character_id", "kind", "ref_key", "ref_source");

--> statement-breakpoint

-- Hot-path: player-bestiary query (character_id + kind)
CREATE INDEX "idx_ck_character_kind" ON "character_knowledge" ("character_id", "kind");

--> statement-breakpoint

-- Housekeeping: queries by world
CREATE INDEX "idx_ck_world" ON "character_knowledge" ("world_id");
