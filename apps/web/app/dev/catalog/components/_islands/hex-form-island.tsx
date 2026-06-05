'use client';

/**
 * HexFormIsland — catalog demo of the DM-only HexForm.
 *
 * HexForm handles hex creation/editing: q/r coordinates (required integers),
 * name, terrain (text), status select (unexplored | rumored | explored | cleared),
 * playerNotes, and dmNotes. Uses canonical ui/ form primitives.
 *
 * INTERACTIVE — filling fields and submitting runs the stub (~400ms) then shows
 * a confirmation line. onDone is a local no-op so the form stays visible.
 */

import { useState } from 'react';
import { HexForm } from '@/components/world/map/hex-form';
import type { HexBody } from '@/app/mapa/actions';

export function HexFormIsland({ mode }: { mode?: 'create' | 'edit' }) {
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <HexForm
        mode={mode ?? 'create'}
        initial={
          mode === 'edit'
            ? {
                id: 'hex-01',
                worldId: 'world-barovia',
                parentHexId: null,
                scale: 'region',
                q: 3,
                r: -2,
                worldX: 320,
                worldY: 180,
                name: 'Bosque de Svalich',
                terrain: 'forest',
                status: 'explored',
                dmNotes: 'Un lobo fantasmal patrulla estos bosques de noche.',
                playerNotes: 'Vimos huellas de lobo enormes cerca del río.',
                createdAt: '2024-09-12T00:00:00.000Z',
                updatedAt: '2024-10-05T00:00:00.000Z',
              }
            : null
        }
        onSubmit={async (_body: HexBody) => {
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
