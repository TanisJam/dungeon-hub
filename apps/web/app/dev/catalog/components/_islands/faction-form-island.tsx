'use client';

/**
 * FactionFormIsland — catalog demo of the DM-only FactionForm.
 *
 * FactionForm handles faction creation/editing: name (required), state select
 * (active | dormant | destroyed | disbanded), description, and dmNotes. Uses
 * canonical ui/ form primitives.
 *
 * INTERACTIVE — filling fields and submitting runs the stub (~400ms) then shows
 * a confirmation line. onDone is a local no-op so the form stays visible.
 */

import { useState } from 'react';
import { FactionForm } from '@/components/world/factions/faction-form';
import type { FactionBody } from '@/app/codex/actions';

export function FactionFormIsland({ mode }: { mode?: 'create' | 'edit' }) {
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <FactionForm
        mode={mode ?? 'create'}
        initial={
          mode === 'edit'
            ? {
                id: 'fac-01',
                worldId: 'world-barovia',
                name: 'Los Vistani',
                state: 'active',
                description:
                  'Pueblo nómade con lazos misteriosos con Strahd von Zarovich.',
                dmNotes: 'En realidad sirven a Strahd como espías voluntarios.',
                createdAt: '2024-09-01T00:00:00.000Z',
                updatedAt: '2024-10-20T00:00:00.000Z',
              }
            : null
        }
        onSubmit={async (_body: FactionBody) => {
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
