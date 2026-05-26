/**
 * list-world-characters.ts — Lists characters scoped to a world for the
 * DM session panel (SDD `dm-session-panel`, REQ-WDCL-LIST-ENDPOINT +
 * REQ-WDCL-STATUS-FILTER).
 *
 * Membership gating is handled at the route layer. This use-case assumes the
 * caller is already authorized to read the world (worldMember of any role)
 * and just shapes the response: characters × owner username, with an optional
 * status filter and a defensive 100-row cap.
 *
 * The owner identity is sourced from `public.users.username` (NOT from
 * `auth.users.email`) — see SDD design #858 D6: `public.users` exposes no
 * email column and cross-schema joins into `auth` require service-role.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters, users } from '../../infra/db/schema.js';
import type { CharacterStatus } from '@dungeon-hub/domain/character/approval';

const DEFAULT_LIMIT = 100;

export interface ListWorldCharactersInput {
  worldId: string;
  callerUserId: string;
  statusFilter?: CharacterStatus[];
}

export interface ListedWorldCharacter {
  id: string;
  name: string;
  status: CharacterStatus;
  classes: Array<{ classSlug: string; level: number }>;
  /** Sum of class levels. 0 when no class has been chosen yet. */
  level: number;
  ownerUserId: string;
  /** From `public.users.username`. */
  ownerUsername: string;
}

interface RawCharacterClass {
  classSlug?: string;
  level?: number;
}

/**
 * Projects `character.data.classes[]` (JSONB) into the shape the list response
 * advertises. Tolerates legacy/empty rows (no classes yet → `level: 0`).
 */
function projectClasses(data: unknown): { classes: Array<{ classSlug: string; level: number }>; level: number } {
  if (!data || typeof data !== 'object') return { classes: [], level: 0 };
  const raw = (data as { classes?: unknown }).classes;
  if (!Array.isArray(raw)) return { classes: [], level: 0 };
  const cls: Array<{ classSlug: string; level: number }> = [];
  let total = 0;
  for (const entry of raw as RawCharacterClass[]) {
    if (!entry || typeof entry !== 'object') continue;
    const slug = typeof entry.classSlug === 'string' ? entry.classSlug : '';
    const lvl = typeof entry.level === 'number' && Number.isFinite(entry.level) ? entry.level : 0;
    if (!slug) continue;
    cls.push({ classSlug: slug, level: lvl });
    total += lvl;
  }
  return { classes: cls, level: total };
}

export async function listWorldCharacters(
  input: ListWorldCharactersInput,
): Promise<ListedWorldCharacter[]> {
  const conditions = [eq(characters.worldId, input.worldId)];
  if (input.statusFilter && input.statusFilter.length > 0) {
    conditions.push(inArray(characters.status, input.statusFilter));
  }

  const whereExpr = conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      status: characters.status,
      data: characters.data,
      ownerUserId: characters.userId,
      ownerUsername: users.username,
    })
    .from(characters)
    .innerJoin(users, eq(users.id, characters.userId))
    .where(whereExpr)
    .orderBy(characters.createdAt)
    .limit(DEFAULT_LIMIT);

  return rows.map((r) => {
    const projected = projectClasses(r.data);
    return {
      id: r.id,
      name: r.name,
      status: r.status as CharacterStatus,
      classes: projected.classes,
      level: projected.level,
      ownerUserId: r.ownerUserId,
      ownerUsername: r.ownerUsername,
    };
  });
}
