'use client';

/**
 * NpcFormIsland — catalog demo of the DM-only NpcForm.
 *
 * NpcForm handles NPC creation/editing: name (required), race (text), status
 * select (alive | dead | missing | unknown), description, and dmNotes. Uses
 * canonical ui/ form primitives.
 *
 * INTERACTIVE — filling fields and submitting runs the stub (~400ms) then shows
 * a confirmation line. onDone is a local no-op so the form stays visible.
 */

import { useState } from 'react';
import { NpcForm } from '@/components/world/npcs/npc-form';
import type { NpcBody } from '@/app/herramientas/actions';

export function NpcFormIsland({ mode }: { mode?: 'create' | 'edit' }) {
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <NpcForm
        mode={mode ?? 'create'}
        initial={
          mode === 'edit'
            ? {
                id: 'npc-strahd',
                worldId: 'world-barovia',
                name: 'Strahd von Zarovich',
                race: 'Vampiro',
                description:
                  'El Señor Oscuro de Barovia. Un vampiro antiguo de poder incalculable.',
                dmNotes:
                  'Está enamorado de Ireena Kolyana. Manipulará al grupo para acercarse a ella.',
                hexId: 'hex-ravenloft',
                status: 'alive',
                worldX: 512,
                worldY: 256,
                factions: [],
                createdAt: '2024-09-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              }
            : null
        }
        onSubmit={async (_body: NpcBody) => {
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
