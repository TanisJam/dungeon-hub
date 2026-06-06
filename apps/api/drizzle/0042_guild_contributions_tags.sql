-- bitacora-gremio W4: add tags[] to guild_contributions for unified tag-search feed.
-- Mirrors journal_entries / world_events / bitacora_pages tags[] + GIN pattern.
-- APPEND-ONLY note: tags are write-at-create only; existing seal/visibility mutation
-- paths remain untouched. tags ⊆ KNOWLEDGE_TAGS (domain-validated at write).
-- Backfill maps ref_entity_kind → single-element KNOWLEDGE_TAGS array where possible.
-- ref_entity_kind values not in the KNOWLEDGE_TAGS map (e.g. hex, homebrew) are
-- intentionally NOT backfilled — those rows stay '{}' (invariant preserved).
--
-- bitacora-gremio SDD spec #1993, design #1994, tasks #1995.
--> statement-breakpoint
ALTER TABLE "guild_contributions" ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
-- Backfill: map ref_entity_kind → single-element tags array (knowledge taxonomy → KNOWLEDGE_TAGS).
-- bestiary→monsters; npc→npcs; faction→factions; location→locations; item→items; spell→spells; lore→lore.
UPDATE "guild_contributions" SET "tags" = ARRAY[
  CASE "ref_entity_kind"
    WHEN 'bestiary' THEN 'monsters'
    WHEN 'npc' THEN 'npcs'
    WHEN 'faction' THEN 'factions'
    WHEN 'location' THEN 'locations'
    WHEN 'item' THEN 'items'
    WHEN 'spell' THEN 'spells'
    WHEN 'lore' THEN 'lore'
    ELSE "ref_entity_kind"
  END
] WHERE "ref_entity_kind" IS NOT NULL
  AND "ref_entity_kind" IN ('bestiary','npc','faction','location','item','spell','lore');
--> statement-breakpoint
CREATE INDEX "idx_gc_tags" ON "guild_contributions" USING GIN ("tags");
