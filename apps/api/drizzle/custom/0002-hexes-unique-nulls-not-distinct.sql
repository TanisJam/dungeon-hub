-- ---------------------------------------------------------------------------
-- Unique constraint sobre hexes (campaign_id, parent_hex_id, q, r) con
-- NULLS NOT DISTINCT (PG 15+).
--
-- Drizzle 0.38 todavía no expone `.nullsNotDistinct()` así que el unique se
-- aplica con SQL crudo acá. Sin esto, dos hexes top-level (parent_hex_id NULL)
-- con la misma (q, r) en la misma campaña podrían coexistir porque PG por
-- default trata NULL como distinto de NULL en unique constraints.
--
-- Aplicar DESPUÉS de las migraciones drizzle, una vez que la tabla hexes existe.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS uq_hexes_campaign_parent_qr;

CREATE UNIQUE INDEX uq_hexes_campaign_parent_qr
  ON public.hexes (campaign_id, parent_hex_id, q, r)
  NULLS NOT DISTINCT;
