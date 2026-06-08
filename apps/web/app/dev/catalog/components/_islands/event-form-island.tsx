'use client';

/**
 * EventFormIsland — catalog demo of the DM-only EventForm.
 *
 * EventForm manages world-event creation/editing: title (required), occurredAt
 * (date picker), visibility toggle (public | dm-only), description, tags, and
 * dmNotes. All fields use the canonical ui/ form primitives (FormLabel, FormInput,
 * FormErrorAlert, FormSubmitButton).
 *
 * INTERACTIVE — filling fields and submitting runs the stub (~400ms) then shows
 * a confirmation line. onDone is a local no-op so the form stays visible.
 */

import { useState } from 'react';
import { EventForm } from '@/components/world/events/event-form';
import type { EventBody } from '@/app/bitacora/actions';

export function EventFormIsland({ mode }: { mode?: 'create' | 'edit' }) {
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <EventForm
        mode={mode ?? 'create'}
        initial={
          mode === 'edit'
            ? {
                id: 'evt-01',
                worldId: 'world-barovia',
                title: 'La Caída del Puente de Vallaki',
                description:
                  'El puente principal de Vallaki colapsó durante una tormenta.',
                dmNotes: 'Strahd lo hizo colapsar intencionalmente.',
                occurredAt: '2024-10-15T00:00:00.000Z',
                sourceSessionId: null,
                visibility: 'public',
                tags: ['Vallaki', 'infraestructura'],
                createdAt: '2024-10-16T12:00:00.000Z',
                updatedAt: '2024-10-16T12:00:00.000Z',
              }
            : null
        }
        onSubmit={async (_body: EventBody) => {
          await new Promise((r) => setTimeout(r, 400));
          setLastAction('(Catalog) onSubmit stub → OK (no real server action)');
          setTimeout(() => setLastAction(null), 2000);
          return { ok: true };
        }}
        onDone={() => {
          setLastAction('(Catalog) onDone stub → form stays open in catalog');
          setTimeout(() => setLastAction(null), 2000);
        }}
      />
      {lastAction && (
        <p className="text-[10px] text-primary-deep font-mono text-center">{lastAction}</p>
      )}
    </div>
  );
}
