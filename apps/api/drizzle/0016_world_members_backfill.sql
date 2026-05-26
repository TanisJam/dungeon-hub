-- Migration 0016: backfill campaign_members → world_members
--
-- Context: migration 0015 only inserted campaign OWNERS as worldMembers(role='gm').
-- Existing campaign_members (players) were NOT backfilled into world_members.
-- This was a known gap (engram #782) deferred from C5 (commit 862e6a9).
--
-- This migration closes the gap: every campaign_member whose user_id is not yet
-- a worldMember of the campaign's world is inserted as role='player'.
--
-- After this runs the OR shim in POST /characters is removed and replaced
-- with a single assertWorldMembership(worldId, userId) use-case call.
--
-- This migration is pure DML — no schema changes. The snapshot is identical to 0015.

INSERT INTO world_members (world_id, user_id, role, invited_at)
SELECT DISTINCT c.world_id, cm.user_id, 'player', now()
FROM campaign_members cm
JOIN campaigns c ON cm.campaign_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM world_members wm
  WHERE wm.world_id = c.world_id AND wm.user_id = cm.user_id
);
