import { eq } from 'drizzle-orm';
import { RulesProfileSchema, type RulesProfile } from '@dungeon-hub/domain/rules-profile';
import { db } from '../../infra/db/client.js';
import { campaigns } from '../../infra/db/schema.js';

export interface LoadedCampaign {
  id: string;
  name: string;
  gmUserId: string;
  rulesProfile: RulesProfile;
}

/**
 * Carga una campaña por id y devuelve el Rules Profile parseado (Zod).
 * Devuelve null si no existe. Lanza si el rules_profile guardado es inválido.
 */
export async function loadCampaign(id: string): Promise<LoadedCampaign | null> {
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const parsed = RulesProfileSchema.safeParse(row.rulesProfile);
  if (!parsed.success) {
    throw new Error(
      `Campaign ${id} tiene rules_profile inválido: ${JSON.stringify(parsed.error.flatten())}`,
    );
  }

  return {
    id: row.id,
    name: row.name,
    gmUserId: row.gmUserId,
    rulesProfile: parsed.data,
  };
}
