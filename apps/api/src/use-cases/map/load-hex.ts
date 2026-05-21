import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { campaignMembers, hexes } from '../../infra/db/schema.js';

export type HexStatus = 'unexplored' | 'rumored' | 'explored' | 'cleared';

export interface LoadedHex {
  id: string;
  campaignId: string;
  parentHexId: string | null;
  scale: string | null;
  q: number;
  r: number;
  worldX: number | null;
  worldY: number | null;
  name: string | null;
  terrain: string | null;
  status: HexStatus;
  dmNotes: string | null;
  playerNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadHex(id: string): Promise<LoadedHex | null> {
  const rows = await db.select().from(hexes).where(eq(hexes.id, id)).limit(1);
  return (rows[0] as LoadedHex | undefined) ?? null;
}

export type MapAccess = 'gm' | 'player' | 'none';

/**
 * Acceso al map de una campaña:
 *  - 'gm' = miembro con role='gm' → ve todo (incluye unexplored + dmNotes).
 *  - 'player' = miembro con role='player' → ve solo hexes visibles, sin dmNotes.
 *  - 'none' = no es miembro → 403.
 */
export async function getMapAccess(
  campaignId: string,
  userId: string,
): Promise<MapAccess> {
  const rows = await db
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
    .limit(1);
  if (rows.length === 0) return 'none';
  return rows[0]!.role === 'gm' ? 'gm' : 'player';
}

/**
 * Sanitiza un hex para una respuesta HTTP según el rol:
 *  - GM ve todo (incluyendo dmNotes).
 *  - Players NUNCA ven dmNotes.
 */
export function sanitizeHexForRole(
  hex: LoadedHex,
  access: MapAccess,
): Omit<LoadedHex, 'dmNotes'> & { dmNotes?: string | null } {
  if (access === 'gm') return hex;
  const { dmNotes: _omit, ...rest } = hex;
  return rest;
}

/**
 * Un hex es visible para un player si:
 *   - status != 'unexplored', Y
 *   - todos sus ancestros en la chain de parentHexId también son visibles
 *     (cascade: si el región-padre está unexplored, sus sub-hexes están
 *     ocultos aunque tengan status diferente).
 *
 * Para el GM, siempre devuelve true.
 *
 * `allHexesById` evita N+1 si el caller ya tiene un map en memoria. Si no,
 * caemos a fetching ad-hoc (puede hacer N queries en el peor caso, OK para
 * los volúmenes de este proyecto).
 */
export async function isHexVisibleToPlayer(
  hex: LoadedHex,
  allHexesById?: ReadonlyMap<string, LoadedHex>,
): Promise<boolean> {
  if (hex.status === 'unexplored') return false;
  let cursor: string | null = hex.parentHexId ?? null;
  const seen = new Set<string>();
  while (cursor != null) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    let parent: LoadedHex | null = allHexesById?.get(cursor) ?? null;
    if (!parent) parent = await loadHex(cursor);
    if (!parent || parent.status === 'unexplored') return false;
    cursor = parent.parentHexId ?? null;
  }
  return true;
}

/**
 * Lista todos los hexes de una campaña, opcionalmente filtrados por parent
 * (null = top-level). El caller filtra visibility después.
 */
export async function listHexesInCampaign(args: {
  campaignId: string;
  /** undefined = todos. null = solo top-level. string = solo hijos de ese parent. */
  parentHexId?: string | null;
}): Promise<LoadedHex[]> {
  const { campaignId, parentHexId } = args;
  const conditions = [eq(hexes.campaignId, campaignId)];
  if (parentHexId !== undefined) {
    if (parentHexId === null) {
      conditions.push(isNull(hexes.parentHexId));
    } else {
      conditions.push(eq(hexes.parentHexId, parentHexId));
    }
  }
  const rows = await db.select().from(hexes).where(and(...conditions));
  return rows as LoadedHex[];
}

/**
 * Detecta ciclos al cambiar el parentHexId de un hex.
 * Retorna true si el nuevo parent es el propio hex o un descendiente.
 *
 * Carga todos los hexes de la campaña en memoria — OK para nuestros volúmenes.
 */
export async function wouldCreateCycle(args: {
  campaignId: string;
  hexId: string;
  newParentId: string;
}): Promise<boolean> {
  if (args.newParentId === args.hexId) return true;

  const all = await listHexesInCampaign({ campaignId: args.campaignId });
  const byId = new Map(all.map((h) => [h.id, h]));

  // Walk hacia arriba desde newParent. Si tocamos hexId → ciclo.
  let cursor: string | null = args.newParentId;
  const seen = new Set<string>();
  while (cursor != null) {
    if (cursor === args.hexId) return true;
    if (seen.has(cursor)) break; // ciclo ya existente, no agravamos
    seen.add(cursor);
    const node: LoadedHex | undefined = byId.get(cursor);
    cursor = node?.parentHexId ?? null;
  }
  return false;
}
