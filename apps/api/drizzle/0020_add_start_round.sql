-- engine-timeline-duration: add start_round to modifier_instances
-- REQ-DUR-STORE-01 (sdd/engine-timeline-duration/design ADR-1)
--
-- Nullable integer column: lifecycle promotion (mirrors concentration_token).
-- NULL = non-encounter cast OR legacy row → evaluateDuration falls back to active.
-- No DEFAULT — existing rows keep NULL without a table rewrite.
-- No index this slice (GC / filtering is done at app layer, not SQL range scan).
--
-- PHB n/a — architectural.

ALTER TABLE modifier_instances ADD COLUMN start_round integer;
