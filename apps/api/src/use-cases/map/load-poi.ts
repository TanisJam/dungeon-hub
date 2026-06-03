import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { hexes, pois } from '../../infra/db/schema.js';
import type { MapAccess, HexStatus } from './load-hex.js';

export type PoiStatus = 'unknown' | 'discovered' | 'cleared';

export interface LoadedPoi {
  id: string;
  worldId: string;
  hexId: string | null;
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
  parentHexStatus: HexStatus | null;
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
 * Fetches all POIs in a world via pois.world_id (direct scope, idx_pois_world).
 * LEFT JOINs hexes to project parentHexStatus (HexStatus | null) for
 * single-pass hybrid visibility cascade. Free-floating POIs (hexId null)
 * project parentHexStatus = null.
 *
 * parentHexStatus MUST NOT be serialized to the wire — use stripParentHexStatus.
 *
 * REQ-POIWL-API-05.
 */
export async function listPoisInWorld(args: {
  worldId: string;
}): Promise<LoadedPoiWithHexStatus[]> {
  const rows = await db
    .select({
      id: pois.id,
      worldId: pois.worldId,
      hexId: pois.hexId,
      name: pois.name,
      description: pois.description,
      dmNotes: pois.dmNotes,
      status: pois.status,
      worldX: pois.worldX,
      worldY: pois.worldY,
      createdAt: pois.createdAt,
      updatedAt: pois.updatedAt,
      parentHexStatus: hexes.status, // HexStatus | null (null for free-floating)
    })
    .from(pois)
    .leftJoin(hexes, eq(pois.hexId, hexes.id)) // LEFT: keeps free-floating POIs
    .where(eq(pois.worldId, args.worldId)); // direct scope, uses idx_pois_world

  return rows as LoadedPoiWithHexStatus[];
}

/**
 * Filters a world-scope POI list for player visibility in a single pass:
 *   1. Hybrid hex-status gate (REQ-POIWL-VIS-01, REQ-POIWL-VIS-02):
 *      - Hex-bound POIs (hexId set): excluded when parent hex is unexplored.
 *      - Free-floating POIs (hexId null): hex gate skipped entirely.
 *   2. POI-level gate: drops status='unknown' and strips dmNotes.
 *
 * Reuses filterPoisByAccess for step 2 — no reimplementation.
 * NO extra query, NO N+1. Pure function — testable without HTTP or DB.
 */
export function filterWorldPoisForPlayer(
  list: LoadedPoiWithHexStatus[],
): Array<Omit<LoadedPoi, 'dmNotes'> & { dmNotes?: string | null }> {
  // Hybrid visibility: hex-associated POIs (hexId set) inherit the hex cascade —
  // dropped when parent hex is unexplored. Free-floating POIs (hexId null) skip
  // the hex gate entirely and rely solely on the POI-level status gate below.
  const onVisibleHex = list.filter(
    (p) => p.hexId == null || p.parentHexStatus !== 'unexplored',
  );
  return filterPoisByAccess(onVisibleHex.map(stripParentHexStatus), 'player');
}
