-- ---------------------------------------------------------------------------
-- world-first-model Slice 1 (ADR-7): Rewrite hexes unique index to use
-- world_id instead of campaign_id, keeping NULLS NOT DISTINCT behavior.
--
-- Drizzle 0.38 cannot express .nullsNotDistinct() in index definitions, so
-- this custom SQL file handles the rewrite. Apply AFTER migration 0031.
--
-- Drops the old uq_hexes_campaign_parent_qr (which referenced campaign_id)
-- and creates the new world-keyed equivalent on (world_id, parent_hex_id, q, r).
--
-- Without NULLS NOT DISTINCT: two top-level hexes (parent_hex_id IS NULL)
-- with the same (world_id, q, r) could coexist because PG treats NULL as
-- distinct from NULL in unique constraints by default.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS uq_hexes_campaign_parent_qr;

CREATE UNIQUE INDEX uq_hexes_world_parent_qr
  ON public.hexes (world_id, parent_hex_id, q, r)
  NULLS NOT DISTINCT;
