import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { hexes, pois } from '../../infra/db/schema.js';
import type { MapAccess, HexStatus } from './load-hex.js';

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

// ---------------------------------------------------------------------------
// World-scope POI listing (Slice 2: world-map-poi-layer)
// ---------------------------------------------------------------------------

/**
 * LoadedPoiWithHexStatus extends LoadedPoi with the JOIN-projected parentHexStatus.
 * This field is used ONLY for cascade filtering — it MUST NOT be serialized to
 * the wire. Use stripParentHexStatus before returning any response.
 */
export interface LoadedPoiWithHexStatus extends LoadedPoi {
  parentHexStatus: HexStatus;
}

/**
 * Removes the internal parentHexStatus field from a LoadedPoiWithHexStatus,
 * returning a plain LoadedPoi. Applied on BOTH GM and player paths to ensure
 * parentHexStatus never reaches the wire.
 */
export function stripParentHexStatus(p: LoadedPoiWithHexStatus): LoadedPoi {
  const { parentHexStatus: _omit, ...rest } = p;
  return rest;
}

/**
 * Fetches all POIs in a world via JOIN pois → hexes on hexId.
 * Projects parentHexStatus from hexes.status for single-pass cascade filtering.
 * Does NOT require a world_id column on pois — the JOIN via hexId is mandatory.
 *
 * REQ-POI-ENDPOINT-01.
 */
export async function listPoisInWorld(args: {
  worldId: string;
}): Promise<LoadedPoiWithHexStatus[]> {
  const rows = await db
    .select({
      id: pois.id,
      hexId: pois.hexId,
      name: pois.name,
      description: pois.description,
      dmNotes: pois.dmNotes,
      status: pois.status,
      worldX: pois.worldX,
      worldY: pois.worldY,
      createdAt: pois.createdAt,
      updatedAt: pois.updatedAt,
      parentHexStatus: hexes.status,
    })
    .from(pois)
    .innerJoin(hexes, eq(pois.hexId, hexes.id))
    .where(eq(hexes.worldId, args.worldId));

  return rows as LoadedPoiWithHexStatus[];
}

/**
 * Filters a world-scope POI list for player visibility in a single pass:
 *   1. Hex-status cascade gate: drops POIs on unexplored hexes (REQ-POI-CASCADE-01).
 *   2. POI-level gate: drops status='unknown' and strips dmNotes (REQ-POI-CASCADE-02).
 *
 * Reuses filterPoisByAccess for step 2 — no reimplementation.
 * NO extra query, NO N+1.
 *
 * Pure function — testable without HTTP or DB.
 */
export function filterWorldPoisForPlayer(
  list: LoadedPoiWithHexStatus[],
): Array<Omit<LoadedPoi, 'dmNotes'> & { dmNotes?: string | null }> {
  const onVisibleHex = list.filter((p) => p.parentHexStatus !== 'unexplored');
  return filterPoisByAccess(onVisibleHex.map(stripParentHexStatus), 'player');
}
