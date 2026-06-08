-- bitacora-personal-share: add title + source_bitacora_page_id to guild_contributions.
--
-- title: nullable text — carried from the source bitácora page at share time.
--   NULL for non-share contributions (legacy rows) and untitled pages.
--   READ-PATH TOLERANCE: existing rows get NULL by default — normalizeContribution
--   already returns title:null for NULL; no regression (REQ-SHARE-02).
--
-- source_bitacora_page_id: nullable uuid FK → bitacora_pages(id) ON DELETE SET NULL.
--   Preserves the contribution (append-only) when the source page is deleted;
--   feed card degrades gracefully to plain "Gremio" badge (ADR-1).
--   Dedup index: idempotency SELECT on share path (ADR-2).
--
-- Both columns nullable: safe ADD COLUMN, no DEFAULT required for existing rows.
-- Migration is safe for existing rows — they get NULL for both columns (REQ-SHARE-12).
-- APPEND-ONLY INVARIANT: unchanged. No UPDATE/DELETE paths introduced.
--
-- bitacora-personal-share SDD spec #2035, design #2036 ADR-1/ADR-2/ADR-3.
--> statement-breakpoint
ALTER TABLE "guild_contributions" ADD COLUMN "title" text;
--> statement-breakpoint
ALTER TABLE "guild_contributions" ADD COLUMN "source_bitacora_page_id" uuid;
--> statement-breakpoint
ALTER TABLE "guild_contributions"
  ADD CONSTRAINT "guild_contributions_source_bitacora_page_id_bitacora_pages_id_fk"
  FOREIGN KEY ("source_bitacora_page_id") REFERENCES "public"."bitacora_pages"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "idx_gc_source_page" ON "guild_contributions" ("source_bitacora_page_id");
