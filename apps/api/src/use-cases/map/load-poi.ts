import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { pois } from '../../infra/db/schema.js';
import type { MapAccess } from './load-hex.js';

export type PoiStatus = 'unknown' | 'discovered' | 'cleared';

export interface LoadedPoi {
  id: string;
  hexId: string;
  name: string;
  description: string | null;
  dmNotes: string | null;
  status: PoiStatus;
  worldX: number | null;
  worldY: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadPoi(id: string): Promise<LoadedPoi | null> {
  const rows = await db.select().from(pois).where(eq(pois.id, id)).limit(1);
  return (rows[0] as LoadedPoi | undefined) ?? null;
}

export async function listPoisForHex(hexId: string): Promise<LoadedPoi[]> {
  const rows = await db.select().from(pois).where(eq(pois.hexId, hexId));
  return rows as LoadedPoi[];
}

/**
 * Filtra y sanitiza POIs según rol:
 *   - GM: todos, con dmNotes.
 *   - Player: solo status != 'unknown', SIN dmNotes.
 *
 * El caller también debería haber chequeado visibilidad del hex parent
 * (cascade); esta función solo filtra a nivel POI.
 */
export function filterPoisByAccess(
  list: LoadedPoi[],
  access: MapAccess,
): Array<Omit<LoadedPoi, 'dmNotes'> & { dmNotes?: string | null }> {
  if (access === 'gm') return list;
  return list
    .filter((p) => p.status !== 'unknown')
    .map((p) => {
      const { dmNotes: _omit, ...rest } = p;
      return rest;
    });
}

export function sanitizePoiForRole(
  poi: LoadedPoi,
  access: MapAccess,
): Omit<LoadedPoi, 'dmNotes'> & { dmNotes?: string | null } {
  if (access === 'gm') return poi;
  const { dmNotes: _omit, ...rest } = poi;
  return rest;
}
