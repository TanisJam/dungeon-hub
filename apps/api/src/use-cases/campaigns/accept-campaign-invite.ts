import { eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { campaignInviteTokens, worldMembers, campaignMembers } from '../../infra/db/schema.js';
import { evaluateInviteToken } from './evaluate-invite-token.js';

export type AcceptResult =
  | { ok: true; campaignId: string; worldId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'CONSUMED' };

/**
 * Atomically accepts a campaign invite token for the given userId.
 *
 * Inside a single db.transaction():
 *   1. Re-fetch the token row FOR UPDATE (TOCTOU close for single-use race).
 *   2. Re-evaluate state inside the tx (not trusting the pre-tx status check).
 *   3. INSERT INTO world_members … ON CONFLICT DO NOTHING
 *      (tolerates existing membership; NEVER downgrades an existing GM).
 *   4. INSERT INTO campaign_members … ON CONFLICT DO NOTHING
 *      (idempotent re-join).
 *   5. Increment use_count atomically.
 *   6. Return { ok: true, campaignId, worldId }.
 *
 * REQ-INV-CONFIRM-01 (atomic dual-write + TOCTOU re-validation).
 */
export async function acceptCampaignInvite(
  token: string,
  userId: string,
): Promise<AcceptResult> {
  return db.transaction(async (tx) => {
    // Step 1: Re-fetch inside the transaction with FOR UPDATE to close the
    // TOCTOU race for concurrent single-use confirms.
    const rows = await tx
      .select()
      .from(campaignInviteTokens)
      .where(eq(campaignInviteTokens.token, token))
      .for('update')
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    // Step 2: Re-validate state inside the tx.
    const now = new Date();
    const state = evaluateInviteToken(row, now);
    if (state === 'EXPIRED') return { ok: false, reason: 'EXPIRED' };
    if (state === 'CONSUMED') return { ok: false, reason: 'CONSUMED' };

    // Step 3: Insert world membership — DO NOTHING preserves existing role
    // (never downgrades an existing GM). Handles multi-campaign-in-same-world.
    await tx
      .insert(worldMembers)
      .values({ worldId: row.worldId, userId, role: 'player' })
      .onConflictDoNothing();

    // Step 4: Insert campaign membership — idempotent re-join.
    await tx
      .insert(campaignMembers)
      .values({ campaignId: row.campaignId, userId, role: 'player' })
      .onConflictDoNothing();

    // Step 5: Increment use_count atomically inside the tx.
    await tx
      .update(campaignInviteTokens)
      .set({ useCount: sql`use_count + 1` })
      .where(eq(campaignInviteTokens.token, token));

    return { ok: true, campaignId: row.campaignId, worldId: row.worldId };
  });
}
