import { eq } from 'drizzle-orm';
import { RulesProfileSchema, type RulesProfile } from '@dungeon-hub/domain/rules-profile';
import { db } from '../../infra/db/client.js';
import { campaigns, worlds } from '../../infra/db/schema.js';

/**
 * Loads rulesProfile (and world metadata) for a given worldId.
 * Used by character routes that need rulesProfile via character.worldId.
 *
 * Returns a LoadedCampaign-like object with rulesProfile sourced from the world.
 * gmUserId is the world ownerUserId (session-runner attribution may differ).
 */
export interface LoadedWorld {
  id: string;
  name: string;
  ownerUserId: string;
  rulesProfile: RulesProfile;
}

export async function loadWorldById(worldId: string): Promise<LoadedWorld | null> {
  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      ownerUserId: worlds.ownerUserId,
      rulesProfile: worlds.rulesProfile,
    })
    .from(worlds)
    .where(eq(worlds.id, worldId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const parsed = RulesProfileSchema.safeParse(row.rulesProfile);
  if (!parsed.success) {
    throw new Error(
      `World ${worldId} has invalid rules_profile: ${JSON.stringify(parsed.error.flatten())}`,
    );
  }

  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.ownerUserId,
    rulesProfile: parsed.data,
  };
}

export interface LoadedCampaign {
  id: string;
  name: string;
  gmUserId: string;
  worldId: string;
  rulesProfile: RulesProfile;
}

/**
 * Carga una campaña por id, joined con su world para obtener rulesProfile.
 * Devuelve null si no existe. Lanza si el rules_profile guardado es inválido.
 *
 * Post-C2: campaigns.rules_profile was moved to worlds.rules_profile.
 * This function joins with worlds to surface rulesProfile on the LoadedCampaign
 * so all callers can continue using campaign.rulesProfile without changes.
 */
export async function loadCampaign(id: string): Promise<LoadedCampaign | null> {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      gmUserId: campaigns.gmUserId,
      worldId: campaigns.worldId,
      rulesProfile: worlds.rulesProfile,
    })
    .from(campaigns)
    .innerJoin(worlds, eq(worlds.id, campaigns.worldId))
    .where(eq(campaigns.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const parsed = RulesProfileSchema.safeParse(row.rulesProfile);
  if (!parsed.success) {
    throw new Error(
      `Campaign ${id} world has invalid rules_profile: ${JSON.stringify(parsed.error.flatten())}`,
    );
  }

  return {
    id: row.id,
    name: row.name,
    gmUserId: row.gmUserId,
    worldId: row.worldId,
    rulesProfile: parsed.data,
  };
}
