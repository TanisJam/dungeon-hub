'use client';

/**
 * JournalFormIsland — catalog demo of the DM-only JournalForm.
 *
 * JournalForm handles journal-entry creation/editing: title (required),
 * visibility toggle (public | dm-only), body (plain text — ADR-3), and
 * tags (comma-separated). Uses canonical ui/ form primitives.
 *
 * INTERACTIVE — filling fields and submitting runs the stub (~400ms) then shows
 * a confirmation line. onDone is a local no-op so the form stays visible.
 */

import { useState } from 'react';
import { JournalForm } from '@/components/world/journal/journal-form';
import type { JournalBody } from '@/app/cronica/actions';

export function JournalFormIsland({ mode }: { mode?: 'create' | 'edit' }) {
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <JournalForm
        mode={mode ?? 'create'}
        initial={
          mode === 'edit'
            ? {
                id: 'jrn-01',
                worldId: 'world-barovia',
                title: 'Primera noche en Barovia',
                body: 'Llegamos al pueblo de Barovia al anochecer. Las calles estaban vacías excepto por una niña llorando en el umbral de una puerta...',
                visibility: 'public',
                tags: ['Barovia', 'llegada'],
                authorUserId: 'user-dm-01',
                createdAt: '2024-09-10T20:00:00.000Z',
                updatedAt: '2024-09-10T20:00:00.000Z',
              }
            : null
        }
        onSubmit={async (_body: JournalBody) => {
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
