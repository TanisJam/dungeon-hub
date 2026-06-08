'use client';

/**
 * JournalClientWrapperIsland — catalog demo of the REAL JournalClientWrapper.
 *
 * Passes a stub actions bundle so the component never fires real server actions.
 * list* resolves fixture data (~300ms). create/update/delete resolve success shapes
 * (~400ms). DM view shown. INTERACTIVE — search, tap row → detail sheet, FAB →
 * create form. All mutations are stubs.
 *
 * REQ-CRO-03, REQ-GATE-01.
 */

import { JournalClientWrapper } from '@/components/world/journal/journal-client-wrapper';
import type { JournalWrapperActions } from '@/components/world/journal/journal-client-wrapper';
import type { JournalRow, JournalSearchResult } from '@/app/bitacora/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_JOURNAL: JournalRow[] = [
  {
    id: 'jn-s1',
    worldId: 'world-barovia',
    title: 'Sesión 1 — Llegada a Barovia',
    body: 'El grupo despertó en un bosque de niebla sin recordar cómo llegaron.\nUn jinete oscuro los observó desde la distancia antes de desaparecer.\nEncontraron el camino al pueblo de Barovia donde los habitantes los miraron con desconfianza.',
    visibility: 'public',
    tags: ['session-1', 'viaje'],
    authorUserId: 'dm-user',
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
  },
  {
    id: 'jn-s2',
    worldId: 'world-barovia',
    title: 'Sesión 2 — El Funeral del Alcalde',
    body: 'El alcalde Kolyan Indirovich fue enterrado bajo lluvia torrencial.\nIreena recibió una corona de rosas que nadie vio colocar.',
    visibility: 'public',
    tags: ['session-2', 'social'],
    authorUserId: 'dm-user',
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
  },
  {
    id: 'jn-dm-notes',
    worldId: 'world-barovia',
    title: 'Notas del DM — Arco de Ireena',
    body: 'Strahd cree que Ireena es la reencarnación de Tatyana. Esto crea tensión con el grupo.',
    visibility: 'dm-only',
    tags: ['dm-only', 'arco-ireena'],
    authorUserId: 'dm-user',
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-03-20T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Stub actions
// ---------------------------------------------------------------------------

const STUB_JOURNAL_ACTIONS: JournalWrapperActions = {
  async listJournalEntries(_worldId, q, _offset, _tag): Promise<JournalSearchResult> {
    await new Promise((r) => setTimeout(r, 300));
    const rows = q?.trim()
      ? FIXTURE_JOURNAL.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase()))
      : FIXTURE_JOURNAL;
    return { rows, total: rows.length };
  },

  async getJournalDetail(entryId) {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_JOURNAL.find((e) => e.id === entryId) ?? null;
  },

  async createJournalEntry(_worldId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const created: JournalRow = {
      id: `jn-new-${Date.now()}`,
      worldId: _worldId,
      title: body.title,
      body: body.body ?? null,
      visibility: body.visibility ?? 'public',
      tags: body.tags ?? [],
      authorUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ok: true as const, data: created };
  },

  async updateJournalEntry(entryId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const existing = FIXTURE_JOURNAL.find((e) => e.id === entryId);
    if (!existing) return { ok: false as const, error: 'Nota no encontrada' };
    return { ok: true as const, data: { ...existing, ...body, updatedAt: new Date().toISOString() } };
  },

  async deleteJournalEntry(_entryId) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true as const, data: undefined };
  },
};

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function JournalClientWrapperIsland() {
  return (
    <JournalClientWrapper
      worldId="world-barovia"
      effectiveView="dm"
      initialEntries={FIXTURE_JOURNAL}
      actions={STUB_JOURNAL_ACTIONS}
    />
  );
}
