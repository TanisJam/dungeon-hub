import { and, arrayContains, desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { worldEvents } from '../../infra/db/schema.js';
import type { MapAccess } from '../map/load-hex.js';

export type WorldEventVisibility = 'public' | 'dm-only';

export interface LoadedWorldEvent {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  dmNotes: string | null;
  occurredAt: Date;
  sourceSessionId: string | null;
  visibility: WorldEventVisibility;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export async function loadWorldEvent(id: string): Promise<LoadedWorldEvent | null> {
  const rows = await db.select().from(worldEvents).where(eq(worldEvents.id, id)).limit(1);
  return (rows[0] as LoadedWorldEvent | undefined) ?? null;
}

export interface ListWorldEventsOptions {
  campaignId: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export async function listWorldEvents(opts: ListWorldEventsOptions): Promise<LoadedWorldEvent[]> {
  const limit = Math.min(opts.limit ?? 200, 500);
  const offset = opts.offset ?? 0;
  const conditions = [eq(worldEvents.campaignId, opts.campaignId)];
  if (opts.tag) conditions.push(arrayContains(worldEvents.tags, [opts.tag]));

  const rows = await db
    .select()
    .from(worldEvents)
    .where(and(...conditions))
    .orderBy(desc(worldEvents.occurredAt))
    .limit(limit)
    .offset(offset);
  return rows as LoadedWorldEvent[];
}

/** Filtra dm-only events para non-GM y quita dmNotes. */
export function filterWorldEventsByAccess(
  list: LoadedWorldEvent[],
  access: MapAccess,
): Array<Omit<LoadedWorldEvent, 'dmNotes'> & { dmNotes?: string | null }> {
  if (access === 'gm') return list;
  return list
    .filter((e) => e.visibility === 'public')
    .map((e) => {
      const { dmNotes: _omit, ...rest } = e;
      return rest;
    });
}

export function sanitizeWorldEventForRole(
  event: LoadedWorldEvent,
  access: MapAccess,
): Omit<LoadedWorldEvent, 'dmNotes'> & { dmNotes?: string | null } {
  if (access === 'gm') return event;
  const { dmNotes: _omit, ...rest } = event;
  return rest;
}
