import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { quests } from '../../infra/db/schema.js';
import type { WorldAccess } from '../auth/get-world-access.js';

export type QuestStatus = 'available' | 'active' | 'completed' | 'abandoned';
export type QuestVisibility = 'public' | 'dm-only';

export interface LoadedQuest {
  id: string;
  worldId: string;
  title: string;
  description: string | null;
  /** Present on GM responses; stripped to null for non-GM callers (ADR-2). */
  dmNotes: string | null;
  status: QuestStatus;
  visibility: QuestVisibility;
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadQuest(id: string): Promise<LoadedQuest | null> {
  const rows = await db.select().from(quests).where(eq(quests.id, id)).limit(1);
  return (rows[0] as LoadedQuest | undefined) ?? null;
}

export interface ListQuestsOptions {
  worldId: string;
  status?: QuestStatus;
  limit?: number;
  offset?: number;
}

export async function listQuests(opts: ListQuestsOptions): Promise<LoadedQuest[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const conditions = [eq(quests.worldId, opts.worldId)];
  if (opts.status) conditions.push(eq(quests.status, opts.status));

  const rows = await db
    .select()
    .from(quests)
    .where(and(...conditions))
    .orderBy(desc(quests.updatedAt))
    .limit(limit)
    .offset(offset);
  return rows as LoadedQuest[];
}

/**
 * Filters a quest list for non-GM callers:
 *   1. Drops rows where visibility === 'dm-only'.
 *   2. Strips dmNotes from remaining rows (even on 'public' quests).
 *
 * GM callers receive the list unchanged (dmNotes present).
 * This is ADR-2 — per-field secret strip on top of whole-row visibility filter.
 */
export function filterQuestsByAccess(list: LoadedQuest[], access: WorldAccess): LoadedQuest[] {
  if (access === 'gm') return list;
  return list
    .filter((q) => q.visibility === 'public')
    .map((q) => ({ ...q, dmNotes: null }));
}

/**
 * Projects a single quest for the caller's access level.
 * GM → quest unchanged (dmNotes present).
 * Non-GM → { ...quest, dmNotes: null } (strips dmNotes on public quests).
 * Used by the GET detail endpoint (ADR-2, REQ-QUEST-AUTH-04).
 */
export function projectQuestForAccess(q: LoadedQuest, access: WorldAccess): LoadedQuest {
  if (access === 'gm') return q;
  return { ...q, dmNotes: null };
}
