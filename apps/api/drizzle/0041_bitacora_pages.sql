-- bitacora-personal W2 of codex-ia-reframe: personal bitácora pages table.
--
-- bitacora_pages: player-authored personal notes attached to compendium entities
-- (monsters only this wave). Replaces the stub "Notas" tab content.
--
-- MUTABLE INVARIANT: all columns (title/body/refs/tags) may be UPDATEd (UNLIKE
-- guild_contributions which is append-only). Personal pages belong to the player.
--
-- refs: JSONB array of { kind, refKey, refSource }. Validated at write (domain:
-- validateBitacoraPage). Only kind='monster' accepted this wave.
-- tags: text[] ⊆ KNOWLEDGE_TAGS. GIN-indexed for ?tag= filter.
-- visibility: CLOSED enum 'personal'|'guild'|'canonical' — only 'personal' used now.
-- world_id: scopes future guild-share (W3); matches character_knowledge pattern.
--
-- bitacora-personal SDD spec #1974, design #1975, tasks #1976.

--> statement-breakpoint

CREATE TABLE "bitacora_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL,
  "world_id" uuid NOT NULL,
  "title" text,
  "body" text NOT NULL DEFAULT '',
  "refs" jsonb NOT NULL DEFAULT '[]',
  "tags" text[] NOT NULL DEFAULT '{}',
  "visibility" text NOT NULL DEFAULT 'personal',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bp_visibility_check" CHECK (visibility IN ('personal', 'guild', 'canonical'))
);

--> statement-breakpoint

ALTER TABLE "bitacora_pages"
  ADD CONSTRAINT "bitacora_pages_character_id_characters_id_fk"
  FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

ALTER TABLE "bitacora_pages"
  ADD CONSTRAINT "bitacora_pages_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

-- Hot-path: list a character's pages
CREATE INDEX "idx_bp_character" ON "bitacora_pages" ("character_id");

--> statement-breakpoint

-- Tag filter in SQL (clone character_knowledge GIN pattern)
CREATE INDEX "idx_bp_tags" ON "bitacora_pages" USING GIN ("tags");
