import { and, arrayContains, desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { journalEntries } from '../../infra/db/schema.js';
import type { MapAccess } from '../map/load-hex.js';

export type JournalVisibility = 'public' | 'dm-only';

export interface LoadedJournalEntry {
  id: string;
  campaignId: string;
  title: string;
  body: string | null;
  visibility: JournalVisibility;
  tags: string[];
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadJournalEntry(id: string): Promise<LoadedJournalEntry | null> {
  const rows = await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
  return (rows[0] as LoadedJournalEntry | undefined) ?? null;
}

export interface ListJournalOptions {
  campaignId: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export async function listJournalEntries(opts: ListJournalOptions): Promise<LoadedJournalEntry[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const conditions = [eq(journalEntries.campaignId, opts.campaignId)];
  if (opts.tag) conditions.push(arrayContains(journalEntries.tags, [opts.tag]));

  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(...conditions))
    .orderBy(desc(journalEntries.updatedAt))
    .limit(limit)
    .offset(offset);
  return rows as LoadedJournalEntry[];
}

/** Filtra dm-only entries para non-GM. (No hay dmNotes field — la entry
 *  entera es o pública o privada.) */
export function filterJournalByAccess(
  list: LoadedJournalEntry[],
  access: MapAccess,
): LoadedJournalEntry[] {
  if (access === 'gm') return list;
  return list.filter((e) => e.visibility === 'public');
}
