'use client';

/**
 * PoiFormIsland — catalog demo of the DM-only PoiForm.
 *
 * PoiForm handles POI creation/editing: name (required), description, dmNotes,
 * status select (unknown | discovered | cleared), and worldX/worldY coordinates.
 * It uses inline labels/inputs (not the canonical ui/ form primitives — that is
 * intentional per the component's own design; see poi-form.tsx header comment).
 *
 * INTERACTIVE — filling fields and submitting runs the stub (~400ms). Canceling
 * calls onDone (stub logs and is no-op). Form stays visible in the catalog.
 */

import { useState } from 'react';
import { PoiForm } from '@/components/world/map/poi-form';
import type { PoiBody } from '@/app/mapa/actions';

export function PoiFormIsland({ mode }: { mode?: 'create' | 'edit' }) {
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <PoiForm
        mode={mode ?? 'create'}
        initial={
          mode === 'edit'
            ? {
                id: 'poi-01',
                hexId: 'hex-svalich',
                worldId: 'world-barovia',
                name: 'Ruinas del Templo de Barovia',
                description: 'Antiguo templo devorado por la niebla.',
                dmNotes: 'Aquí yace el grimorio de Strahd.',
                status: 'discovered',
                worldX: 320,
                worldY: 180,
                createdAt: '2024-09-12T00:00:00.000Z',
                updatedAt: '2024-10-05T00:00:00.000Z',
              }
            : null
        }
        initialCoords={mode !== 'edit' ? { worldX: 256, worldY: 128 } : null}
        idPrefix="catalog"
        onSubmit={async (_body: PoiBody) => {
          await new Promise((r) => setTimeout(r, 400));
          setLastAction('(Catalog) onSubmit stub → OK (no real server action)');
          setTimeout(() => setLastAction(null), 2000);
          return { ok: true };
        }}
        onDone={() => {
          setLastAction('(Catalog) onDone / Cancel stub → form stays open in catalog');
          setTimeout(() => setLastAction(null), 2000);
        }}
      />
      {lastAction && (
        <p className="text-[10px] text-primary-deep font-mono text-center">{lastAction}</p>
      )}
    </div>
  );
}
