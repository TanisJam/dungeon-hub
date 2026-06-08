'use client';

/**
 * EventClientWrapperIsland — catalog demo of the REAL EventClientWrapper.
 *
 * Passes a stub actions bundle so the component never fires real server actions.
 * list* resolves fixture data (~300ms). create/update/delete resolve success shapes
 * (~400ms). DM view shown. INTERACTIVE — search, tap row → detail sheet, FAB →
 * create form. All mutations are stubs.
 *
 * REQ-CRO-02, REQ-GATE-01.
 */

import { EventClientWrapper } from '@/components/world/events/event-client-wrapper';
import type { EventWrapperActions } from '@/components/world/events/event-client-wrapper';
import type { EventRow, EventSearchResult } from '@/app/bitacora/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_EVENTS: EventRow[] = [
  {
    id: 'ev-batt',
    worldId: 'world-barovia',
    title: 'La Batalla del Puente de Piedra',
    description: 'Las fuerzas del Conde Strahd cruzaron el puente al amanecer. El grupo resistió durante tres horas antes de retirarse al este.',
    dmNotes: 'El puente quedó destruido — bloquea la ruta principal al castillo.',
    occurredAt: '2024-03-15T00:00:00.000Z',
    sourceSessionId: 'session-3',
    visibility: 'public',
    tags: ['combate', 'session-3'],
    createdAt: '2024-03-16T00:00:00.000Z',
    updatedAt: '2024-03-16T00:00:00.000Z',
  },
  {
    id: 'ev-curse',
    worldId: 'world-barovia',
    title: 'La Maldición de la Bruja del Pantano',
    description: null,
    dmNotes: 'Baba Lysaga reveló la ubicación de la segunda losa.',
    occurredAt: '2024-04-02T00:00:00.000Z',
    sourceSessionId: null,
    visibility: 'dm-only',
    tags: ['ritual', 'dm-only'],
    createdAt: '2024-04-03T00:00:00.000Z',
    updatedAt: '2024-04-03T00:00:00.000Z',
  },
  {
    id: 'ev-feast',
    worldId: 'world-barovia',
    title: 'El Banquete del Castillo',
    description: 'Strahd invitó al grupo a cenar. Nadie rechazó la invitación.',
    dmNotes: null,
    occurredAt: '2024-04-20T00:00:00.000Z',
    sourceSessionId: 'session-5',
    visibility: 'public',
    tags: ['social', 'session-5'],
    createdAt: '2024-04-21T00:00:00.000Z',
    updatedAt: '2024-04-21T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Stub actions
// ---------------------------------------------------------------------------

const STUB_EVENT_ACTIONS: EventWrapperActions = {
  async listEvents(_worldId, q, _offset, _tag): Promise<EventSearchResult> {
    await new Promise((r) => setTimeout(r, 300));
    const rows = q?.trim()
      ? FIXTURE_EVENTS.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase()))
      : FIXTURE_EVENTS;
    return { rows, total: rows.length };
  },

  async getEventDetail(eventId) {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_EVENTS.find((e) => e.id === eventId) ?? null;
  },

  async createEvent(_worldId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const created: EventRow = {
      id: `ev-new-${Date.now()}`,
      worldId: _worldId,
      title: body.title,
      description: body.description ?? null,
      dmNotes: body.dmNotes ?? null,
      occurredAt: body.occurredAt,
      sourceSessionId: body.sourceSessionId ?? null,
      visibility: body.visibility ?? 'public',
      tags: body.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ok: true as const, data: created };
  },

  async updateEvent(eventId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const existing = FIXTURE_EVENTS.find((e) => e.id === eventId);
    if (!existing) return { ok: false as const, error: 'Evento no encontrado' };
    return { ok: true as const, data: { ...existing, ...body, updatedAt: new Date().toISOString() } };
  },

  async deleteEvent(_eventId) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true as const, data: undefined };
  },
};

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function EventClientWrapperIsland() {
  return (
    <EventClientWrapper
      worldId="world-barovia"
      effectiveView="dm"
      initialEvents={FIXTURE_EVENTS}
      actions={STUB_EVENT_ACTIONS}
    />
  );
}
